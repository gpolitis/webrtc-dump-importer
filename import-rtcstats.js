function decompress(baseStats, newStats) {
  const timestamp = newStats.timestamp
  delete newStats.timestamp;
  Object.keys(newStats).forEach(function(id) {
    if (!baseStats[id]) {
      if (newStats[id].timestamp === 0) {
        newStats[id].timestamp = timestamp;
      }
      baseStats[id] = newStats[id];
    } else {
      const report = newStats[id];
      if (report.timestamp === 0) {
          report.timestamp = timestamp;
      } else if (!report.timestamp) {
          report.timestamp = new Date(baseStats[id].timestamp).getTime();
      }
      Object.keys(report).forEach(function(name) {
        baseStats[id][name] = report[name];
      });
    }
  });
  return baseStats;
}

var fileFormat;
function doImport(evt) {
  evt.target.disabled = 'disabled';
  var files = evt.target.files;
  var file = files[0];
  var reader = new FileReader();
  reader.onload = (function(file) {
    return function(e) {
      var result = e.target.result;
      if (typeof result === 'object') {
        result = pako.inflate(result, {to: 'string'});
      }
      if (result.indexOf('\n') === -1) {
        // old format v0
        thelog = JSON.parse(result);
      } else {
        // new format, multiple lines
        var baseStats = {};
        var lines = result.split('\n');
        var client = JSON.parse(lines.shift());
        fileFormat = client.fileFormat;
        client.peerConnections = {};
        client.getUserMedia = [];
        lines.forEach(function(line) {
            if (line.length) {
                var data = JSON.parse(line);
                var time = new Date(data.time || data[data.length - 1]);
                delete data.time;
                switch(data[0]) {
                case 'getUserMedia':
                case 'getUserMediaOnSuccess':
                case 'getUserMediaOnFailure':
                case 'navigator.mediaDevices.getUserMedia':
                case 'navigator.mediaDevices.getUserMediaOnSuccess':
                case 'navigator.mediaDevices.getUserMediaOnFailure':
                case 'navigator.mediaDevices.getDisplayMedia':
                case 'navigator.mediaDevices.getDisplayMediaOnSuccess':
                case 'navigator.mediaDevices.getDisplayMediaOnFailure':
                    client.getUserMedia.push({
                        time: time,
                        type: data[0],
                        value: data[2]
                    });
                    break;
                default:
                    if (!client.peerConnections[data[1]]) {
                        client.peerConnections[data[1]] = [];
                        baseStats[data[1]] = {};
                    }
                    if (data[0] === 'getstats') { // delta-compressed
                        data[2] = decompress(baseStats[data[1]], data[2]);
                        baseStats[data[1]] = JSON.parse(JSON.stringify(data[2]));
                    }
                    if (data[0] === 'getStats' || data[0] === 'getstats') {
                        data[2] = mangle(data[2]);
                        data[0] = 'getStats';
                    }
                    client.peerConnections[data[1]].push({
                        time: time,
                        type: data[0],
                        value: data[2]
                    });
                    break;
                }
            }
        });
        thelog = client;
      }
      importUpdatesAndStats(thelog);
    };
  })(file);
  if (file.type === 'application/gzip') {
    reader.readAsArrayBuffer(files[0]);
  } else {
    reader.readAsText(files[0]);
  }
}

function createContainers(connid, url) {
    var el;
    var container = document.createElement('details');
    container.open = true;
    container.style.margin = '10px';

    var summary = document.createElement('summary');
    summary.innerText = 'Connection:' + connid + ' URL: ' + url;
    container.appendChild(summary);

    if (connid !== 'null') {
        // show state transitions, like in https://webrtc.github.io/samples/src/content/peerconnection/states
        var signalingState = document.createElement('div');
        signalingState.id = 'signalingstate_' + connid;
        signalingState.textContent = 'Signaling state:';
        container.appendChild(signalingState);
        var iceConnectionState = document.createElement('div');
        iceConnectionState.id = 'iceconnectionstate_' + connid;
        iceConnectionState.textContent = 'ICE connection state:';
        container.appendChild(iceConnectionState);
        var connectionState = document.createElement('div');
        connectionState.id = 'connectionstate_' + connid;
        connectionState.textContent = 'Connection state:';
        container.appendChild(connectionState);
    }

    if (connid !== 'null') {
        // for ice candidates
        var iceContainer = document.createElement('details');
        iceContainer.open = true;
        summary = document.createElement('summary');
        summary.innerText = 'ICE candidate grid';
        iceContainer.appendChild(summary);

        var ice = document.createElement('table');
        ice.className = 'candidatepairtable';
        var head = document.createElement('tr');
        ice.appendChild(head);

        el = document.createElement('td');
        el.innerText = 'Local address';
        head.appendChild(el);

        el = document.createElement('td');
        el.innerText = 'Local type';
        head.appendChild(el);

        el = document.createElement('td');
        el.innerText = 'Remote address';
        head.appendChild(el);

        el = document.createElement('td');
        el.innerText = 'Remote type';
        head.appendChild(el);

        el = document.createElement('td');
        el.innerText = 'Requests sent';
        head.appendChild(el);

        el = document.createElement('td');
        el.innerText = 'Responses received';
        head.appendChild(el);

        el = document.createElement('td');
        el.innerText = 'Requests received';
        head.appendChild(el);

        el = document.createElement('td');
        el.innerText = 'Responses sent';
        head.appendChild(el);

        el = document.createElement('td');
        el.innerText = 'Active Connection';
        head.appendChild(el);

        iceContainer.appendChild(ice);
        container.appendChild(iceContainer);
    }

    var updateLogContainer = document.createElement('details');
    updateLogContainer.open = true;
    container.appendChild(updateLogContainer);

    summary = document.createElement('summary');
    summary.innerText = 'PeerConnection updates:';
    updateLogContainer.appendChild(summary);

    var updateLog = document.createElement('table');
    updateLogContainer.appendChild(updateLog);

    var graphs = document.createElement('div');
    container.appendChild(graphs);

    containers[connid] = {
        updateLog,
        iceConnectionState,
        connectionState,
        signalingState,
        candidates: ice,
        graphs,
    };

    return container;
}

function processGUM(data) {
    var container = document.createElement('details');
    container.open = true;
    container.style.margin = '10px';

    var summary = document.createElement('summary');
    summary.innerText = 'getUserMedia calls';
    container.appendChild(summary);

    var table = document.createElement('table');
    var head = document.createElement('tr');
    table.appendChild(head);

    var el;
    el = document.createElement('th');
    el.innerText = 'getUserMedia';
    head.appendChild(el);

    container.appendChild(table);

    document.getElementById('tables').appendChild(container);
    data.forEach(function(event) {
        processTraceEvent(table, event); // abusing the peerconnection trace event processor...
    });
}

function processTraceEvent(table, event) {
    var row = document.createElement('tr');
    var el = document.createElement('td');
    el.setAttribute('nowrap', '');
    el.innerText = event.time;
    row.appendChild(el);

    // recreate the HTML of webrtc-internals
    var details = document.createElement('details');
    el = document.createElement('summary');
    el.innerText = event.type;
    details.appendChild(el);

    el = document.createElement('pre');
    if (['createOfferOnSuccess', 'createAnswerOnSuccess', 'setRemoteDescription', 'setLocalDescription'].indexOf(event.type) !== -1) {
        el.innerText = 'SDP ' + event.value.type + ':' + event.value.sdp;
    } else {
        el.innerText = JSON.stringify(event.value, null, ' ');
    }
    details.appendChild(el);

    el = document.createElement('td');
    el.appendChild(details);

    row.appendChild(el);

    // guess what, if the event type contains 'Failure' one could use css to highlight it
    if (event.type.indexOf('Failure') !== -1) {
        row.style.backgroundColor = 'red';
    }
    if (event.type === 'iceConnectionStateChange') {
        switch(event.value) {
        case 'ICEConnectionStateConnected':
        case 'ICEConnectionStateCompleted':
            row.style.backgroundColor = 'green';
            break;
        case 'ICEConnectionStateFailed':
            row.style.backgroundColor = 'red';
            break;
        }
    }

    if (event.type === 'onIceCandidate' || event.type === 'addIceCandidate') {
        if (event.value && event.value.candidate) {
            var parts = event.value.candidate.trim().split(' ');
            if (parts && parts.length >= 9 && parts[7] === 'typ') {
                details.classList.add(parts[8]);
            }
        }
    }
    table.appendChild(row);
}

var graphs = {};
var containers = {};
function processConnections(connectionIds, data) {
    var connid = connectionIds.shift();
    if (!connid) return;
    window.setTimeout(processConnections, 0, connectionIds, data);

    var reportname, statname;
    var connection = data.peerConnections[connid];
    var container = createContainers(connid, data.url);
    document.getElementById('tables').appendChild(container);

    for (var i = 0; i < connection.length; i++) {
        if (connection[i].type !== 'getStats' && connection[i].type !== 'getstats') {
            processTraceEvent(containers[connid].updateLog, connection[i]);
        }
    }

    // then, update the stats displays
    var series = {};
    var connectedOrCompleted = false;
    var firstStats;
    var lastStats;
    for (var i = 0; i < connection.length; i++) {
        if (connection[i].type === 'oniceconnectionstatechange' && (connection[i].value === 'connected' || connection[i].value === 'completed')) {
            connectedOrCompleted = true;
        }
        if (connection[i].type === 'getStats' || connection[i].type === 'getstats') {
            var stats = connection[i].value;
            Object.keys(stats).forEach(function(id) {
                if (stats[id].type === 'localcandidate' || stats[id].type === 'remotecandidate') return;
                Object.keys(stats[id]).forEach(function(name) {
                    if (name === 'timestamp') return;
                    //if (name === 'googMinPlayoutDelayMs') stats[id][name] = parseInt(stats[id][name], 10);
                    if (stats[id].type === 'ssrc' && !isNaN(parseFloat(stats[id][name]))) {
                        stats[id][name] = parseFloat(stats[id][name]);
                    }
                    if (stats[id].type === 'ssrc' && name === 'ssrc') return; // ignore ssrc on ssrc reports.
                    if (typeof stats[id][name] === 'number') {
                        if (!series[id]) {
                            series[id] = {};
                            series[id].type = stats[id].type;
                        }
                        if (!series[id][name]) {
                            series[id][name] = [];
                        } else {
                            var lastTime = series[id][name][series[id][name].length - 1][0];
                            if (lastTime && stats[id].timestamp && stats[id].timestamp - lastTime > 20000) {
                                series[id][name].push([stats[id].timestamp || new Date(connection[i].time).getTime(), null]);
                            }
                        }
                        if (fileFormat >= 2) {
                            series[id][name].push([stats[id].timestamp, stats[id][name]]);
                        } else {
                            series[id][name].push([new Date(connection[i].time).getTime(), stats[id][name]]);
                        }
                    }
                });
            });
        }
        if (connection[i].type === 'getStats' || connection[i].type === 'getstats') {
            if (!firstStats && connectedOrCompleted) firstStats = connection[i].value;
            lastStats = connection[i].value;
        }
    }
    var interestingStats = lastStats; // might be last stats which contain more counters
    if (interestingStats) {
        var stun = [];
        var t;
        for (reportname in interestingStats) {
            if (reportname.indexOf('Conn-') === 0) {
                t = reportname.split('-');
                comp = t.pop();
                t = t.join('-');
                stats = interestingStats[reportname];
                stun.push(stats);
            }
        }
        for (t in stun) {
            var row = document.createElement('tr');
            var el;

            el = document.createElement('td');
            el.innerText = stun[t].googLocalAddress;
            row.appendChild(el);

            el = document.createElement('td');
            el.innerText = stun[t].googLocalCandidateType;
            row.appendChild(el);

            el = document.createElement('td');
            el.innerText = stun[t].googRemoteAddress;
            row.appendChild(el);

            el = document.createElement('td');
            el.innerText = stun[t].googRemoteCandidateType;
            row.appendChild(el);

            el = document.createElement('td');
            el.innerText = stun[t].requestsSent;
            row.appendChild(el);

            el = document.createElement('td');
            el.innerText = stun[t].responsesReceived;
            row.appendChild(el);

            el = document.createElement('td');
            el.innerText = stun[t].requestsReceived;
            row.appendChild(el);

            el = document.createElement('td');
            el.innerText = stun[t].responsesSent;
            row.appendChild(el);

            el = document.createElement('td');
            el.innerText = stun[t].googActiveConnection;
            row.appendChild(el);
            /*
            el = document.createElement('td');
            el.innerText = stun[t].consentRequestsSent;
            row.appendChild(el);
            */

            containers[connid].candidates.appendChild(row);
        }
    }

    var graphTypes = {};
    var graphSelectorContainer = document.createElement('div');
    containers[connid].graphs.appendChild(graphSelectorContainer);

    graphs[connid] = {};
    var reportobj = {};
    for (reportname in series) {
        var graphType = series[reportname].type;
        graphTypes[graphType] = true;

        var container = document.createElement('details');
        container.open = true;
        container.classList.add('webrtc-' + graphType);
        containers[connid].graphs.appendChild(container);

        var title = connid + ' type=' + graphType + ' ' + reportname;

        var summary = document.createElement('summary');
        summary.innerText = title;
        container.appendChild(summary);

        var chartContainer = document.createElement('div');
        chartContainer.id = 'chart_' + Date.now();
        container.appendChild(chartContainer);

        var da = [];
        Object.keys(series[reportname]).forEach(function(name) {
            if (name === 'type') return;
            da.push({
                name: name,
                data: series[reportname][name]
            });
        });
        var graph = new Highcharts.Chart({
            title: {
                text: title
            },
            xAxis: {
                type: 'datetime'
            },
            /*
            yAxis: {
                min: 0
            },
            */
            chart: {
                zoomType: 'x',
                renderTo : chartContainer.id
            },
            series: da
        });
        graphs[connid][reportname] = graph;

        // draw checkbox to turn off everything
        ((reportname, container, graph) => {
            container.ontoggle = () => container.open && graph.reflow();
            var checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            container.appendChild(checkbox);
            var label = document.createElement('label');
            label.innerText = 'Turn on/off all data series in ' + connid + ' ' + reportname;
            container.appendChild(label);
            checkbox.onchange = function() {
                graph.series.forEach(function(series) {
                    series.setVisible(!checkbox.checked, false);
                });
                graph.redraw();
            };
        })(reportname, container, graph);
    }

    Object.keys(graphTypes).forEach(function(type) {
        var checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = true;
        graphSelectorContainer.appendChild(checkbox);

        var label = document.createElement('label');
        label.innerText = 'Toggle graphs for type=' + type;
        graphSelectorContainer.appendChild(label);

        var selector = '.webrtc-' + type;
        checkbox.onchange = function() {
            containers[connid].graphs.querySelectorAll(selector).forEach(function(el) {
                el.open = checkbox.checked;
            });
        };
    });
}

function importUpdatesAndStats(data) {
    document.getElementById('userAgent').innerText = data.userAgent;
    processGUM(data.getUserMedia);
    window.setTimeout(processConnections, 0, Object.keys(data.peerConnections), data);
}
