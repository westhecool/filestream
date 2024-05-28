const ws = require('ws');
const http = require('http');
const wss = new ws.Server({ noServer: true });
const server = http.createServer();
var files = {};

wss.on('error', (error) => {
    console.log(error);
});

wss.on('connection', (ws, request) => {
    ws.on('error', (error) => {
        console.log(error);
    });
    console.log('client connected');
    var info = null;
    const l = (message) => {
        try {
            const msg = JSON.parse(message);
            if (msg.e == 'ping') {
                ws.send(JSON.stringify({ e: 'pong' }));
                return;
            }
            if (msg.e == 'info') {
                info = msg;
                if (info.t == 0) { // 0 = host
                    files[info.h] = { name: info.n, size: info.s, clients: {}, ws };
                    delete info.n;
                    delete info.s;
                } else if (info.t == 1) { // 1 = client
                    if (!files[info.h]) {
                        ws.send(JSON.stringify({ e: 'error', c: 404, m: 'File not found' }), () => ws.close());
                        return;
                    }
                    files[info.h].clients[request.socket.remoteAddress + ':' + request.socket.remotePort] = ws;
                    ws.send(JSON.stringify({ e: 'info', n: files[info.h].name, s: files[info.h].size }));
                    files[info.h].ws.send(JSON.stringify({ e: 'connect', c: request.socket.remoteAddress + ':' + request.socket.remotePort }));
                } else if (info.t == 2) { // 2 = server to client connection
                    if (!files[info.h] || !files[info.h].clients[info.c]) {
                        ws.send(JSON.stringify({ e: 'error', c: 404, m: 'Client not found' }), () => ws.close());
                        return;
                    }
                    ws.on('message', (message) => {
                        try {
                            files[info.h].clients[info.c].send(message);
                        } catch (e) {
                            console.log(e);
                        }
                    });
                    ws.on('close', () => {
                        try {
                            files[info.h].clients[info.c].close();
                        } catch (e) {
                            console.log(e);
                        }
                    });
                    files[info.h].clients[info.c].on('message', (message) => {
                        try {
                            ws.send(message);
                        } catch (e) {
                            console.log(e);
                        }
                    });
                    files[info.h].clients[info.c].on('close', () => {
                        try {
                            ws.close();
                        } catch (e) {
                            console.log(e);
                        }
                    });
                    files[info.h].clients[info.c].send(JSON.stringify({ e: 'connect' }));
                    ws.send(JSON.stringify({ e: 'connect' }));
                    ws.off('message', l);
                }
            }
        } catch (e) {
            console.log(e);
        }
    }
    ws.on('message', l);
    ws.on('close', () => {
        console.log('client disconnected');
        if (info && info.t == 0) {
            for (const c in files[info.h].clients) {
                try {
                    files[info.h].clients[c].close();
                } catch (e) {
                    console.log(e);
                }
            }
            delete files[info.h];
        } else if (info && info.t == 1 && files[info.h]) {
            delete files[info.h].clients[request.socket.remoteAddress + ':' + request.socket.remotePort];
        }
    });
});

server.on('request', (request, response) => {
    response.writeHead(404);
    response.end();
});

server.on('upgrade', (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
    });
});

server.listen(3000);