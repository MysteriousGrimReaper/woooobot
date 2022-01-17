// Modules
const {logMessage, sendMessage, getTime, toUnixTime, save} = require("./helpers.js");
const {generate: morshu} = require("./morshu.js");
// Data
const {twowPath} = require("./config.json"); // TODO: Add support for multiple TWOWs
const status = require(twowPath + "status.json");
const {currentRound, seasonPath, roundPath} = status;
const {
	roles: {remind},
	channels: {bots, voting, reminders: remindersId, results: resultsId}
} = require(twowPath + "twowConfig.json");
// Season-specific
const {reminders, sections: _s, megascreen: _m} = require(seasonPath + "seasonConfig.json");
const {drawScreen, drawResults} = require(seasonPath + "graphics.js");
// Round-specific
// TODO: Find a better way to do destructuring assignment with a collective default value
const {prompt, vDeadline, keywords, sections = _s, megascreen = _m} = require(roundPath + "roundConfig.json");
const responses = require(roundPath + "responses.json");
const votes = require(roundPath + "votes.json");
const screens = require(roundPath + "screens.json");
const {screenSections, screenResponses, sectionScreens} = screens;
// Functions
function partitionResponses(responseAmount) {
	const MIN = 7;
	const MAX = (2 * MIN - 1);
	const IDEAL = Math.floor((MAX + MIN) / 2);
	// Trivial cases
	if (responseAmount <= MAX) {
		return [responseAmount];
	}
	if (responseAmount >= IDEAL * (IDEAL - 1)) { // Special case of the Chicken McNugget theorem
		let screenSizes = Array(Math.floor(responseAmount / IDEAL));
		return screenSizes.fill(IDEAL).fill(IDEAL + 1, 0, responseAmount % IDEAL);
	}
	// TODO: General case
	let screenSizes = [];
	let i = 0;
	while (responseAmount > IDEAL) {
		screenSizes[i] = IDEAL;
		responseAmount -= IDEAL;
		i++;
	}
	screenSizes[i] = responseAmount;
	return screenSizes;
}
function createScreen(responses, keyword, section) {
	let rows = new Map();
	let ids = new Map();
	// Create text screen
	let screen = `\`\`\`\n${keyword}\n`;
	// TODO: Extend characters
	let chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
	let charIndex = 0;
	for (const response of responses) {
		let char = chars[charIndex];
		screen += `${char}\t${response.twist ?? response.text}\n`;
		rows.set(char, response.twist ?? response.text);
		ids.set(char, response.id);
		charIndex++;
	}
	screen += "```";
	logMessage(screen);
	screenSections[keyword] = section;
	screenResponses[keyword] = Object.fromEntries(ids.entries());
	// Draw screen
	const path = `${roundPath}/screens/${keyword}.png`;
	drawScreen(path, keyword, Array.from(rows.entries())).then(() => {
		sendMessage(voting, {
			content: screen, // For easy voter.js input
			files: [{
				attachment: path,
				name: keyword + ".png"
			}]
		}, true);
	});
}
function createSection(responses, sizes, sectWord) {
	for (let i = 0; i < responses.length; i++) { // Randomize response array
		let j = Math.floor(Math.random() * i);
		[responses[i], responses[j]] = [responses[j], responses[i]];
	}
	for (let i = 0; i < sizes.length; i++) {
		createScreen(responses.splice(0, sizes[i]), `${sectWord}-${i + 1}`, sectWord);
	}
}
exports.initVoting = function () {
	logMessage("Voting period started.");
	status.phase = "voting";
	save(`${twowPath}/status.json`, status);
	const unixDeadline = toUnixTime(vDeadline);
	sendMessage(voting, `@everyone ${currentRound}\nVote to <@814748906046226442> by <t:${unixDeadline}> (<t:${unixDeadline}:R>)`, true);
	// Create voting
	logMessage(prompt);
	const screenSizes = partitionResponses(responses.length);
	for (let i = 0; i < sections; i++) {
		createSection([...responses], screenSizes, (i + 1).toString());
	}
	if (megascreen) {
		createScreen(responses, "MEGA", "MEGA");
	}
	save(roundPath + "screens.json", screens);
};
exports.logVote = function (message) {
	logMessage(`Recording vote by ${message.author}:\n${message}`);
	const voteFull = Array.from(message.content.matchAll(/\[([^\s[\]]+) ([^\s[\]]+)\]/g));
	if (voteFull.length === 0) {
		return "No valid vote found.";
	}
	const section = votes[message.author.id]?.section ?? screenSections[voteFull[0][1]];
	let ratings = new Map();
	for (const [_, screen, vote] of voteFull) {
		// Check validity
		if (!(screen in screenSections)) {
			return `The screen \`${screen}\` does not exist.`;
		}
		if (screenSections[screen] !== section) {
			return `The screen \`${screen}\` is not in section \`${section}\`. You may only vote in one section.`;
		}
		if (vote.length !== Object.keys(screenResponses[screen]).length) {
			return `The vote \`${vote}\` for screen \`${screen}\` is too ${vote.length > Object.keys(screenResponses[screen]).length ? "long" : "short"}.`;
		}
		if (vote.length !== (new Set(vote.split(""))).size) {
			return `The vote \`${vote}\` for screen \`${screen}\` contains duplicate characters.`;
		}
		// Calculate individual response ratings
		let position = 0;
		for (const char of vote) {
			if (!(char in screenResponses[screen])) {
				return `Invalid character \`${char}\` found in vote \`${vote}\` for screen \`${screen}\`.`;
			}
			ratings.set(screenResponses[screen][char], (vote.length - position - 1) / (vote.length - 1));
			position++;
		}
	}
	// Apply ratings to responses (separate step for atomicity)
	for (const [id, rating] of ratings) {
		const response = responses.find(res => (res.id === id));
		response.ratings ??= {}; // Would be a map if they were natively serializable
		response.ratings[message.author.id] = rating;
	}
	save(roundPath + "responses.json", responses);
	// Update votes.json
	const matches = voteFull.map(matches => [matches[1], matches[2]]);
	votes[message.author.id] ??= {
		section: section,
		supervote: false,
		screens: {},
		messages: []
	};
	votes[message.author.id].screens = Object.assign(votes[message.author.id].screens, Object.fromEntries(matches));
	votes[message.author.id].messages.push({
		id: message.id,
		time: getTime(message.createdAt),
		text: message.content
	});
	if (Object.keys(votes[message.author.id].screens).length === sectionScreens[section]) {
		votes[message.author.id].supervote = true;
	}
	// TODO: Add more stats
	save(roundPath + "votes.json", votes);
	return `Your vote has been recorded:\n\`\`\`${voteFull.map(matches => matches[0]).join("\n")}\`\`\`${votes[message.author.id].supervote ? "Thank you for supervoting!" : ""}`;
};
exports.results = function () {
	logMessage("Results started.");
	// TODO: Calculate results
	const rankings = [];
	for (const response of responses) {
		const ratings = Array.from(Object.values(response.ratings));
		const percentage = ratings.reduce((a, b) => a + b, 0) / ratings.length;
		const stDev = 0; // TODO: Figure out how to calculate
		const skew = 0; // TODO: Figure out how to calculate
		rankings.push({
			type: "hi", // TODO: Figure out how to calculate
			rank: 0, // TODO: Figure out how to calculate
			book: "path", // TODO: Figure out how to calculate
			name: "name", // TODO: Figure out how to calculate
			response: response.text,
			percentage: percentage * 100,
			stDev: stDev * 100,
			skew: skew,
			votes: ratings.length
		});
	}
	// Reveal results
	async function revealSlide(line) {
		line = line.toString().trim();
		if (line === "stop") {
			stdin.removeListener("data", revealSlide);
			// Full leaderboard
			const path = `leaderboard.png`;
			await sendSlide(path, true);
			// Spoiler wall
			for (let i = 0; i < 50; i++) {
				sendMessage(resultsId, morshu(1), true);
			}
			return;
		}
		const path = `slide${slide}.png`;
		await sendSlide(path, (slide === 1));
		slide++;
	}
	async function sendSlide(path, header) {
		// TODO: Use round name
		await drawResults(`${roundPath}/results/${path}`, "Round 1", prompt, rankings, header);
		sendMessage(resultsId, {
			files: [{
				attachment: `${roundPath}/results/${path}`,
				name: path
			}]
		}, true);
	}
	let slide = 1;
	let stdin = process.openStdin();
	stdin.addListener("data", revealSlide); // Enter to reveal
};