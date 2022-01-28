// Modules
const {logMessage, sendMessage, addRole, getTime, toUnixTime, save} = require("./helpers.js");
// Data
const {twowPath} = require("./config.json"); // TODO: Add support for multiple TWOWs
const status = require(twowPath + "status.json");
const {seasonPath, roundPath} = status;
const {
	id: serverId,
	roles: {alive, remind},
	channels: {bots, prompts, reminders: remindersId}
} = require(twowPath + "twowConfig.json");
// Season-specific
const {deadlines, reminders, dummies} = require(seasonPath + "seasonConfig.json");
const technicals = require(seasonPath + "technicals.js");
const twists = require(seasonPath + "twists.js");
// Round-specific
const {prompt, rDeadline, technicals: roundTechnicals = [], twists: roundTwists} = require(roundPath + "roundConfig.json");
const contestants = require(roundPath + "contestants.json");
const responses = require(roundPath + "responses.json");
// Functions
exports.initResponding = async function () {
	logMessage("Responding period started.");
	status.phase = "responding";
	await save(`${twowPath}/status.json`, status);
	const unixDeadline = toUnixTime(rDeadline);
	await sendMessage(prompts, `<@&${alive}> ${status.currentRound} Prompt:\`\`\`\n${prompt}\`\`\`Respond to <@814748906046226442> by <t:${unixDeadline}> (<t:${unixDeadline}:R>)`, true);
};
exports.logResponse = function (message) {
	logMessage(`Recording response by ${message.author}:\n${message}`);
	const isDummy = status.currentRound !== "Round 1" && !contestants.alive.includes(message.author.id);
	if (!dummies && isDummy) {
		return "Dummy/filler responses are currently not accepted.";
	}
	const allowed = contestants.prize.includes(message.author.id) ? 2 : 1;
	contestants.responseCount[message.author.id] ??= 0;
	// TODO: Allow edits
	if (contestants.responseCount[message.author.id] >= allowed) {
		return `You have already responded to the prompt!`;
	}
	// Default tenWords technical
	function tenWord(response) {
		return response.split(/\s/).filter(word => /\w/.test(word)).length <= 10; // Don't count punctuation-only "words"
	}
	let passesTechnicals = roundTechnicals.includes("noTenWord") ? true : tenWord(message.content);
	// Check other technicals
	passesTechnicals ||= roundTechnicals.reduce((passes, name) => {
		return passes && technicals[name].check(message.content);
	}, true);
	if (!passesTechnicals) {
		return `Your response (\`${message}\`) failed a technical.\nIt has not been recorded; please submit a response that follows all technicals.`;
	}
	// Build response object
	let messageData = {
		id: message.id,
		author: message.author.id,
		time: getTime(message.createdAt),
		text: message.content
	};
	if (roundTwists != null) {
		messageData.twist = roundTwists.reduce((message, name) => {
			return twists[name].execute(message);
		}, message.content);
	}
	responses.push(messageData);
	if (status.currentRound === "Round 1") {
		// Do Round 1 stuff
		contestants.alive.push(message.author.id);
		addRole(serverId, message.author.id, alive);
	}
	contestants.responseCount[message.author.id]++;
	save(`${roundPath}/responses.json`, responses);
	save(`${roundPath}/contestants.json`, contestants);
	return `Your response (\`${message}\`) has been recorded. Your response is response #${responses.length}`;
};