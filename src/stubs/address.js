"use strict";
// Stub for the 'address' npm package.
// ali-oss uses address.ip() only in cluster.js for load-balancing server selection.
// This plugin uses single-node OSS mode, so os.networkInterfaces() is sufficient
// and avoids bundling the child_process.exec(ifconfig) call the real package uses.
var os = require("os");

function localIP() {
	var ifaces = os.networkInterfaces();
	var names = Object.keys(ifaces);
	for (var i = 0; i < names.length; i++) {
		var addrs = ifaces[names[i]];
		for (var j = 0; j < addrs.length; j++) {
			if (addrs[j].family === "IPv4" && !addrs[j].internal) {
				return addrs[j].address;
			}
		}
	}
	return "127.0.0.1";
}

function address(interfaceName, callback) {
	if (typeof interfaceName === "function") { callback = interfaceName; }
	var ip = localIP();
	if (callback) callback(null, ip);
	return { ip: ip };
}

address.ip = localIP;
address.mac = function (iface, cb) {
	if (typeof iface === "function") { iface(null, ""); } else if (cb) { cb(null, ""); }
};
address.dns = function (cb) { if (cb) cb(null, []); };

module.exports = address;
