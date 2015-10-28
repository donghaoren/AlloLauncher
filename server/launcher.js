var spawn = require('child_process').spawn;

var BufferedPrintLine = function(callback) {
    this.buffer = new Buffer(0);
    this.callback = callback;
};

BufferedPrintLine.prototype.feed = function(chunk) {
    while(chunk.length > 0) {
        var i;
        for(i = 0; i < chunk.length; i++) {
            if(chunk[i] == 0x0A) break;
        }
        if(i == chunk.length) {
            this.buffer = Buffer.concat([this.buffer, chunk]);
            break;
        } else {
            var line = Buffer.concat([this.buffer, chunk.slice(0, i)]).toString("utf8");
            if(line.trim().length >= 0) {
                this.callback(line);
            }
            chunk = chunk.slice(i + 1);
            this.buffer = new Buffer(0);
        }
    }
};

function LaunchProcess(cmd, args, callbacks) {
    environment_variables = JSON.parse(JSON.stringify(process.env));
    environment_variables["TERM"] = "";
    var p = spawn(cmd, args, {
        env: environment_variables
    });
    p.on('error', (err) => {
        callbacks.post("error", err.toString());
    });
    p.on('close', (code, signal) => {
        callbacks.post("terminated", "code = " + code + ", signal = " + signal);
    });
    var print_stdout = new BufferedPrintLine((line) => {
        callbacks.post("stdout", line);
    });
    var print_stderr = new BufferedPrintLine((line) => {
        callbacks.post("stderr", line);
    });
    p.stderr.on('data', (chunk) => { print_stderr.feed(chunk); });
    p.stdout.on('data', (chunk) => { print_stdout.feed(chunk); });
    p.stderr.resume();
    p.stdout.resume();

    var result = {
        sendCommand: function(line) {
            try {
                p.stdin.write(line + "\n");
                callbacks.post("command", line);
            } catch(e) {
                callbacks.post("error", "Failed to send command, stdin closed.");
            }
        },
        kill: function() {
            p.stdin.end();
            p.kill("SIGHUP");
        }
    };
    return result;
};

var LaunchingController = function(config) {
    this.config = config;
    this.processes = [];
    this.handlers = { };
};

var current_uuid = 1000000;
var GenerateProcessUUID = function() {
    return "P" + (current_uuid++);
};

LaunchingController.prototype.launch = function(id, host, command) {
    var self = this;
    var hostinfo = this.config.hosts[host];
    if(require("util").isArray(hostinfo)) {
        hostinfo.forEach(function(h) {
            self.launch(id, h, command);
        });
        return;
    }
    var cmdargs = hostinfo.translateCommand(command);
    var processinfo = {
        recent_log: [],
        id: id,
        host: host,
        info: {
            id: id,
            host: host,
            command: command
        },
        command: command,
        uuid: GenerateProcessUUID()
    };
    var process = LaunchProcess(cmdargs[0], cmdargs.slice(1), {
        post: (info, line) => {
            processinfo.recent_log.push([ info, line ]);
            // Limit the number of lines stored.
            if(processinfo.recent_log.length > 1000) {
                processinfo.recent_log.splice(0, processinfo.recent_log.length - 100);
            }
            self.raise("log", processinfo.uuid, processinfo.info, info, line);
            if(info == "terminated") {
                var idx = self.processes.indexOf(processinfo);
                if(idx >= 0) {
                    self.processes.splice(idx, 1);
                }
            }
        }
    });
    processinfo.process = process;
    self.raise("log", processinfo.uuid, processinfo.info, "launched", "Waiting for program output...");
    this.processes.push(processinfo);
};

LaunchingController.prototype.raise = function(eventname) {
    if(!this.handlers[eventname]) return;
    try {
        this.handlers[eventname].apply(this, Array.prototype.slice.call(arguments, 1));
    } catch(e) {
    }
};

LaunchingController.prototype.on = function(eventname, handler) {
    this.handlers[eventname] = handler;
};

// List all launched configs, each with 10 recent output logs.
LaunchingController.prototype.list = function() {
    return this.processes.map((process) => {
        return {
            id: process.id,
            host: process.host,
            command: process.command,
            info: {
                id: process.id,
                host: process.host,
                command: process.command
            },
            uuid: process.uuid,
            recent_log: process.recent_log.slice(-100)
        };
    });
};

LaunchingController.prototype.killByUUID = function(uuid) {
    this.processes.filter((process) => process.uuid == uuid).forEach((process) => {
        process.process.kill();
    });
};

LaunchingController.prototype.killByID = function(id) {
    this.processes.filter((process) => process.id == id).forEach((process) => {
        process.process.kill();
    });
};

LaunchingController.prototype.sendCommandByUUID = function(uuid, line) {
    this.processes.filter((process) => process.uuid == uuid).forEach((process) => {
        process.process.sendCommand(line);
    });
};

LaunchingController.prototype.sendCommandByID = function(id, line) {
    this.processes.filter((process) => process.id == id).forEach((process) => {
        process.process.sendCommand(line);
    });
};

exports.LaunchingController = LaunchingController;
