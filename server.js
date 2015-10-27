var HTTPServer = require("./server/server.js").HTTPServer;

var config = require("js-yaml").load(require("fs").readFileSync("config.yaml", "utf-8"));

var server = new HTTPServer(config);

var presets = [];

function UpdatePresets() {
    require("fs").readdir("./presets", function(err, files) {
        if(err) return;
        presets = [];
        for(var f of files) {
            if(f.match(/\.yaml$/i)) {
                var fn = "./presets/" + f;
                var content = require("js-yaml").load(require("fs").readFileSync(fn, "utf-8"));
                presets.push(content);
            }
        }

        server.broadcast("presets.list", presets);
    });
}

server.on("presets.scan", UpdatePresets);


var LaunchingController = require("./server/launcher.js").LaunchingController;
var launcher = new LaunchingController(config);

var shell_quote = require('shell-quote').quote;
var shell_parse = require('shell-quote').parse;

var command_to_arg_array = function(command) {
    if(typeof(command) == "string") {
        return shell_parse(command);
    } else {
        return command;
    }
};

for(var host in config.hosts) {
    var hostinfo = config.hosts[host];
    if(hostinfo.direct) {
        hostinfo.translateCommand = function(command) {
            command = command_to_arg_array(command);
            return command;
        };
    }
    if(hostinfo.command) {
        hostinfo.translateCommand = function(command) {
            command = command_to_arg_array(command);
            var result = [];
            for(var arg of hostinfo.command) {
                if(arg == "{ESCAPED_COMMAND}") result.push(shell_quote(command));
                else if(arg == "{COMMAND}") result = result.concat(command);
                else result.push(arg);
            }
            return result;
        };
    }
    console.log(hostinfo.translateCommand("ls -lh"));
}

launcher.on("log", (uuid, info, type, line) => {
    server.broadcast("launcher.log", uuid, info, type, line);
});

server.on("launcher.launch", (id, host, command) => {
    launcher.launch(id, host, command);
});

server.on("launcher.kill_by_uuid", (uuid) => {
    launcher.killByUUID(uuid);
});

server.on("launcher.kill_by_id", (id) => {
    launcher.killByID(id);
});

server.on("launcher.send_command_by_uuid", (uuid, command) => {
    launcher.sendCommandByUUID(uuid, command);
});

server.on("launcher.send_command_by_id", (id, command) => {
    launcher.sendCommandByID(id, command);
});

server.on("launcher.scan", () =>{
    server.broadcast("launcher.list", launcher.list());
});
