// Logging
const fs = require("fs");
const {client} = require("./index.js");
const {logging} = require("./config.json");
let logStream;
if (logging != null) {
	const time = new Date();
	const path = logging + time.toISOString().substring(0, 7);
	fs.promises.mkdir(path, {recursive: true}).then(() => {
		logStream = fs.createWriteStream(`${path}/${exports.getTime(time).replace(/\s/g, "-")}.log`, {flags: "ax"});
	});
}
exports.logMessage = function (message, error = false) {
	if (Array.isArray(message)) {
		message = message.join("\n\t");
	}
	const time = exports.getTime();
	if (error) {
		console.error(`${time} ${message}`);
	} else {
		console.log(`${time} ${message}`);
	}
	if (logging != null) {
		logStream.write(`${time} ${message}\n`);
	}
};
// Discord.js
exports.sendMessage = async function (destination, message, id = false) {
	if (id) {
		try {
			const channel = await client.channels.fetch(destination)
			exports.sendMessage(channel, message);
		} catch {
			const user = await client.users.fetch(destination);
			const dm = await user.createDM();
			exports.sendMessage(dm, message);
		}
		return;
	}
	if ((message.content?.length ?? message.length ?? 0) > 2000) {
		throw new Error("Message is too long!");
	}
	destination.send(message);
	// Log message
	if (typeof message === "object") {
		message = JSON.stringify(message);
	}
	if (destination.type === "DM") {
		exports.logMessage(`[S] ${destination.recipient.tag}:\n	${message}`);
	} else { // If it's not a DM it's probably a text channel.
		exports.logMessage(`[S] ${destination.guild.name}, ${destination.name}:\n	${message}`);
	}
};
// Time
exports.getTime = function (time = new Date()) {
	return time.toISOString().substring(0, 10) + " " + time.toISOString().substring(11, 19);
};
exports.toSnowflake = function (time) {
	const unixTime = Math.floor(exports.toUnixTime(time));
	// Convert to Discord epoch
	return (BigInt(unixTime - 1420070400) << 22n).toString() + "000";
};
exports.toUnixTime = function (time) {
	if (time == null) {
		return Date.now() / 1000;
	}
	return new Date(time).getTime() / 1000;
};
// Miscellaneous
exports.save = function (path, content) {
	fs.promises.writeFile(path, JSON.stringify(content, null, "\t"));
};