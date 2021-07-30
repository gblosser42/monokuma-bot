var Discord = require('discord.js');
var fs = require('fs');

var mybot;
var config;
var clues;
var locations;
var players;

if (!fs.existsSync('./config.json')) {
	fs.writeFileSync('./config.json', JSON.stringify({discord:{token:'YOUR TOKEN'}}).replace(/\r?\n|\r/g,''));
}

if (!fs.existsSync('./clues.json')) {
	fs.writeFileSync('./clues.json', JSON.stringify({notfound:{},found:{}}).replace(/\r?\n|\r/g,''));
}

if (!fs.existsSync('./locations.json')) {
	fs.writeFileSync('./locations.json', '{}');
}

if (!fs.existsSync('./players.json')) {
	fs.writeFileSync('./players.json', '[]');
}

var log = function(message, isError) {
    if (isError) {
		console.log(message);
        fs.appendFileSync('./error.log',message+'\n');
    }
};

try {
		 
	var server, serverRoles, adminId, activeId;
	var getRoles = async function(user, guild) {
		var roles = {
			admin: false,
			active: false
		};
		var user = await guild.members.fetch(user.id);
		user._roles.forEach(role => {
			if (role===adminId) {
				roles.admin = true;
				roles.active = true;
			} else if (role===activeId) {
				roles.active = true;
			}
		});
		return roles;
	};
	
	var saveClues = function () {
		fs.writeFileSync('./clues.json', JSON.stringify(clues));
	};
	
	var saveLocations = function () {
		fs.writeFileSync('./locations.json', JSON.stringify(locations));
	};
	
	var savePlayers = function () {
		fs.writeFileSync('./players.json', JSON.stringify(players));
	}
	
	var listClues = function (user) {
		if (!clues.found[user.username]) {
			clues.found[user.username] = [];
		}
		var clueBuilder = '';
		clues.found[user.username].forEach(clue => {
			clueBuilder += `In the ${clue.location}, while investigating the ${clue.detail} you discovered ${clue.description}\n`;
		});
		if (clueBuilder === '') {
			clueBuilder = 'You haven\'t found ANY clues! Are you even trying?';
		}
		saveClues();
		user.send(clueBuilder);
	};
	
	var listAllClues = function (user) {
		user.send(JSON.stringify(clues,null,4));
	};
	
	var listAllLocations = function (user) {
		user.send(JSON.stringify(locations,null,4));
	};
	
	var addClue = function (user, parts, mess) {
		var loc = parts[1];
		var detail = parts[2];
		parts.splice(0,3);
		var desc = parts.join(' ');
		if (!clues.notfound[loc]) {
			clues.notfound[loc] = {};
		}
		if (!clues.notfound[loc][detail]) {
			clues.notfound[loc][detail] = [];
		}
		clues.notfound[loc][detail].push(desc);
		mess.reply(`Successfully added a clue in the ${loc} at the ${detail}: ${desc}`);
		saveClues();
	}
	
	var resetClues = function (mess) {
		clues = {
			notfound: {},
			found: {}
		}
		mess.reply('Reset all clues');
		saveClues();
	};
	
	var updateLocation = function (parts, mess) {
		var loc = parts[1];
		parts.splice(0,2);
		var desc = parts.join(' ');
		if (!locations[loc]) {
			locations[loc] = {
				description: '',
				details: []
			};
		}
		locations[loc].description = desc;
		mess.reply(`Updated ${loc}'s desscription to read: ${desc}`);
		saveLocations();
	}
	
	var addDetail = function (parts, mess) {
		var loc = parts[1];
		var detail = parts[2];
		locations[loc].details.push(detail);
		mess.reply(`Added ${detail} to ${loc}`);
		saveLocations();
	}
	
	var removeDetail = function (parts, mess) {
		var loc = parts[1];
		var detail = parts[2];
		var index = locations[loc].details.indexOf(detail);
		locations[loc].details.splice(index,1);
		mess.reply(`Removed ${detail} from ${loc}`);
		saveLocations();
	}
	
	var look = function (channel, mess) {
		var loc = channel.name;
		var location = locations[loc];
		if (locations[loc]) {
			mess.reply(`${location.description}\nDetails:${location.details}`);
		}
	};
	
	var search = function (channel, user, parts, mess) {
		var loc = channel.name;
		var name = user.username;
		var detail = parts[1];
		var locObj = locations[loc];
		if (locObj) {
			if (players.indexOf(name) > -1) {
				mess.reply('You\'ve already searched this round!');
			} else if (locObj.details.indexOf(detail) === -1) {
				mess.reply(`${detail} isn't a valid search detail at this location`);
			} else {
				players.push(name);
				var availableClues = clues.notfound[loc][detail];
				if (availableClues && availableClues.length > 0) {
					var clueFound = availableClues.shift();
					clues.notfound[loc][detail] = availableClues;
					user.send(clueFound);
					if (!clues.found[name]) {
						clues.found[name] = [];
					}
					clues.found[name].push(
					{
						location: loc,
						detail: detail,
						description: clueFound
					}
					);
					saveClues();
					savePlayers();
				} else {
					user.send(`You didn't find anything unusual at the ${detail}`);
				}
			}
		}
	};
	
	var acted = function (mess) {
		mess.reply(players.join(' '));
	};
	
	var resetActions = function (mess) {
		players = [];
		savePlayers();
		mess.reply('Reset player actions');
	}
	
	var help = function (admin, mess) {
		var helpMessage = '\n!look - Lists information about the current location\n!search DETAIL - Searches DETAIl at the current location for clues. You can only search once per round.\n!acted - Lists the players who have acted this round';
		if (admin) {
			helpMessage += '\n!clues - Sends you a private message containing all clue information\n!location - Sends you a private message containing all location information\n!addClue LOCATION DETAIL DESCRIPTION - Adds a clue to DETAIL at LOCATION with text DESCRIPTION\n!resetClues - Clears all clue data\n!updateLocation LOCATION DESCRIPTION - Sets LOCATION\'s description to DESCRIPTION\n!addDetail LOCATION DETAIL - Adds DETAIL to LOCATION\n!removeDetail LOCATION DETAIL - Removes DETAIL from LOCATION\n!newRound - Resets player actions, allowing players to search again.'
		} else {
			helpMessage += '\n!clues - Sends you a private message containing the clues you have discovered so far';
		}
		mess.reply(helpMessage);
	}
	
	var mainProcess = function () {
		 mybot = new Discord.Client();
		 mybot.login(config.token);

		 mybot.on('message', async function(mess) {
			var user, channel, message, server;
			var result;
			user = mess.author;
			if (user.username !== 'Monokuma Bot') {
				message = mess.content;
				channel = mess.channel;
				server = mess.channel.guild;
				if (!serverRoles) {
					serverRoles = await server.roles.fetch();
					adminId = serverRoles.cache.find(role => role.name === 'Murder Admin').id;
					activeId = serverRoles.cache.find(role => role.name === 'Murder Player').id;
				}
				var roles = await getRoles(user, server);
				if (message.charAt(0) === '!' && roles.active) {
					var parts = message.substr(1).split(' ');
					var command = parts[0];
					switch (command) {
						case 'clues':
							if (roles.admin) {
								listAllClues(user);
							} else {
								listClues(user);
							}
							break;
						case 'addClue':
							if (roles.admin) {
								addClue(user, parts, mess);
							}
							break;
						case 'resetClues':
							if (roles.admin) {
								resetClues(mess);
							}
							break;
						case 'updateLocation':
							if (roles.admin) {
								updateLocation(parts, mess);
							}
							break;
						case 'addDetail':
							if (roles.admin) {
								addDetail(parts, mess);
							}
							break;
						case 'removeDetail':
							if (roles.admin) {
								removeDetail(parts, mess);
							}
							break;
						case 'locations':
							if (roles.admin) {
								listAllLocations(user);
							}
							break;
						case 'look':
							if (roles.active) {
								look(channel, mess);
							}
							break;
						case 'search':
							if (roles.active) {
								search(channel, user, parts, mess);
							}
							break;
						case 'acted':
							if (roles.active) {
								acted(mess);
							}
							break;
						case 'newRound': 
							if (roles.admin) {
								resetActions(mess);
							}
							break;
						case 'help':
						default:
							if (roles.active) {
								help(roles.admin, mess);
							}
					}
				}
			}
		});
	}

	var configFile = require('./config.json');
	clues = require('./clues.json');
	locations = require('./locations.json');
	players = require('./players.json');
	config = configFile.discord;
	if (config.token === 'YOUR TOKEN') {
		var pw=true;
		process.stdin.resume();
		process.stdin.setEncoding('utf8');
		console.log('Enter your Discord Bot Token: ');
		process.stdin.on('data', function (token) {
			config.token = token.replace(/\r?\n|\r/g,'');
			fs.writeFileSync('./config.json', JSON.stringify({discord:config}).replace(/\r?\n|\r/g,''));
			mainProcess();
		});
	} else {
		mainProcess();
	}
} catch (e) {log(e,true);}