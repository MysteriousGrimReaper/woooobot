const {prefix, token, myID, botID} = require("./config.json");
const morshu = require("./morshu.js");
const Discord = require("discord.js");
const client = new Discord.Client();
const me = client.users.fetch(myID).then(user => {
	console.log(user);
	return user;
});
function sendMessage(destination, message) { // Log into console all woooobot messages
	if (message.length > 2000) {
		console.log("Message is too long!");
		return;
	}
	destination.send(message);
	if (destination.type === "dm") {
		console.log(`[S] ${destination.recipient.tag}:\n	${message}`);
	} else { // If it's not a User or DM channel it's probably a text channel.
		console.log(`[S] ${destination.guild.name}, ${destination.name}:\n	${message}`);
	}
}
function logDM(message) {
	if (message.guild === null && message.author.id != botID) {
		const log = `${message.author.tag}:\n	${message}`;
		if (message.author.id === myID) { // I know what I sent
			console.log(`[R] ${log}`);
		} else {
			me.then(user => {
				sendMessage(user.dmChannel, message);
			});
		}
	}
}
client.once("ready", () => {
	console.log(`\n${'='.repeat(14 + client.user.tag.length)}\nLogged in as ${client.user.tag}.\n`);
});
client.on("message", msg => {
	// Act on bot DMs
	logDM(msg);
	// Act on messages with the bot prefix
	if (msg.content.substring(0, prefix.length) === prefix) {
		let content = msg.content.substring(prefix.length);
		let command = content.split(" ", 1)[0];
		let args = content.substring(command.length + 1); // Keep the separating space out as well
		let reply = "";
		switch (command) {
			case "help":
				reply = `
Welcome to woooobot. Here are the current available commands:
\`\`\`
ping: Ping yourself.
echo <message>: Repeats your message.
morshu <wordCount>: Generates <wordCount> amount of morshu words. Default amount is 10 words.
\`\`\`
				`;
				break;
			case "eval":
				if (msg.author.id === myID) {
					try {
						if (args.substring(0, 3) === "```") {
							args = args.substring(3, args.length - 3);
						}
						eval(args);
					} catch (e) {
						console.log(`Error parsing input command(s): "${args}"\n	${e}`);
					}
				} else {
					reply = "Your permissions aren't high enough for this command!";
				}
				break;
			case "ping":
				reply = `<@${msg.author.id}>`;
				break;
			case "echo":
				reply = `Your message: **${args}**.`;
				break;
			case "morshu":
				if (Number.isInteger(Number(args)) && Number(args) > 0) {
					reply = morshu.generate(Number(args));
				} else if (args == "") {
					reply = morshu.generate(10);
				} else {
					reply = `I couldn't parse "${args}", so here's 10 words:\n${morshu.generate(10)}`;
				}
				break;
			default:
				reply = `Error: There isn't a command named ${command}.`;
				break;
		}
		if (reply) {
			sendMessage(msg.channel, reply);
		}
	}
});
client.login(token);