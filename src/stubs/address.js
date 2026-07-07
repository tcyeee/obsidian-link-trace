"use strict";
// Stub for the 'address' npm package.
// ali-oss's cluster.js calls address.ip() once at module load (unconditionally, even
// though this plugin never uses ClusterClient) purely to name a per-host status-check
// file for load-balancing. Single-node OSS mode never reads that file, so the value is
// functionally unused — a fixed loopback address avoids probing real network interfaces
// (os.networkInterfaces()) and the child_process.exec(ifconfig) call the real package uses.
function localIP() {
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
