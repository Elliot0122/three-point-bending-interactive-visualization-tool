// ==================== Data Processor ====================
class DataProcessor {
    constructor() {
        this.rawData = null;
        this.fileName = null;
        this.columns = ['Elapsed Time', 'Scan Time', 'Display 1', 'Load 1', 'Load 2'];
        this.originalDf = null;
        this.dfForAreaCalc = null;
        this.linePoints = null;

        this.maxSlope = null;
        this.originalSlopePointOne = null;
        this.originalSlopePointTwo = null;
        this.customSlope = null;
        this.customSlopePointOne = null;
        this.customSlopePointTwo = null;

        this.maxValue = null;
        this.maxX = null;
        this.areaUnderCurve = null;
        this.originalYieldDisplacement = null;
        this.originalYieldStrength = null;
        this.yieldDisplacement = null;
        this.yieldStrength = null;
    }

    resetData() {
        this.customSlope = this.maxSlope;
        this.customSlopePointOne = [...this.originalSlopePointOne];
        this.customSlopePointTwo = [...this.originalSlopePointTwo];
        this.yieldDisplacement = this.originalYieldDisplacement;
        this.yieldStrength = this.originalYieldStrength;
    }

    setYieldPoint(x, y) {
        this.yieldDisplacement = x;
        this.yieldStrength = y;
    }

    setCustomSlopePointOne(x, y) {
        this.customSlopePointOne = [x, y];
    }

    setCustomSlopePointTwo(x, y) {
        this.customSlopePointTwo = [x, y];
    }

    calculateCustomSlope() {
        const [x1, y1] = this.customSlopePointOne;
        const [x2, y2] = this.customSlopePointTwo;
        this.customSlope = (y2 - y1) / (x2 - x1);
    }

    processFile(text, fileName) {
        this.fileName = fileName.split('.')[0];
        // Normalize line endings and split (keep empty lines for correct indexing)
        let lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
        // Remove "Axial Counts" lines and skip first 5 lines (like Python code)
        lines = lines.filter(l => l.substring(0, 12) !== 'Axial Counts');
        this.rawData = lines.slice(5).filter(l => l.trim() !== '');
    }

    // Determine which load column to use: pick the one whose first element < 0
    getPreferredLoadColumn() {
        if (!this.rawData || this.rawData.length === 0) return 'Load 1';
        const delimiter = this.rawData[0].includes(',') ? ',' : '\t';
        const firstLine = this.rawData[0].split(delimiter).filter(x => x.trim() !== '').slice(1, 6);
        if (firstLine.length >= 5) {
            const load1First = parseFloat(firstLine[3]);
            const load2First = parseFloat(firstLine[4]);
            if (load1First < 0) return 'Load 1';
            if (load2First < 0) return 'Load 2';
        }
        return 'Load 1';
    }

    processData(xCol, yCol) {
        const delimiter = this.rawData[0].includes(',') ? ',' : '\t';
        const cleanData = this.rawData.map(line => {
            const parts = line.split(delimiter).filter(x => x.trim() !== '').slice(1, 6);
            return parts.map(v => parseFloat(v.trim()));
        }).filter(row => row.length === 5 && row.every(v => !isNaN(v)));

        // Build arrays per column
        const data = {};
        this.columns.forEach((col, i) => {
            data[col] = cleanData.map(row => row[i]);
        });
        this.originalDf = data;

        // Negate x and y columns
        this.originalDf[yCol] = this.originalDf[yCol].map(v => 0 - v);
        this.originalDf[xCol] = this.originalDf[xCol].map(v => 0 - v);

        // Adjust x if first value > 0.005
        if (this.originalDf[xCol][0] > 0.005) {
            const offset = this.originalDf[xCol][0];
            this.originalDf[xCol] = this.originalDf[xCol].map(v => v - offset);
        }

        // Find max index in y column
        let maxIdx = 0;
        let maxVal = -Infinity;
        this.originalDf[yCol].forEach((v, i) => {
            if (v > maxVal) { maxVal = v; maxIdx = i; }
        });

        // Truncate after large drop past max
        for (let i = maxIdx + 1; i < this.originalDf[yCol].length; i++) {
            if (this.originalDf[yCol][i - 1] - this.originalDf[yCol][i] > 1) {
                // Truncate all columns
                this.columns.forEach(col => {
                    this.originalDf[col] = this.originalDf[col].slice(0, i);
                });
                break;
            }
        }
    }

    setColumns(xCol, yCol) {
        this.processData(xCol, yCol);

        // Max index in y
        let maxIdx = 0;
        let maxVal = -Infinity;
        this.originalDf[yCol].forEach((v, i) => {
            if (v > maxVal) { maxVal = v; maxIdx = i; }
        });

        this.calculateMaxSlope(xCol, yCol);
        this.customSlope = this.maxSlope;
        this.customSlopePointOne = [...this.originalSlopePointOne];
        this.customSlopePointTwo = [...this.originalSlopePointTwo];
        this.maxValue = maxVal;
        this.maxX = this.originalDf[xCol][maxIdx];

        // Find min x index for yield point
        let minXIdx = 0;
        let minXVal = Infinity;
        this.originalDf[xCol].forEach((v, i) => {
            if (v < minXVal) { minXVal = v; minXIdx = i; }
        });
        this.originalYieldDisplacement = this.originalDf[xCol][minXIdx];
        this.originalYieldStrength = this.originalDf[yCol][minXIdx];
        this.yieldDisplacement = this.originalYieldDisplacement;
        this.yieldStrength = this.originalYieldStrength;

        this.calculateAreaUnderCurve(xCol, yCol);
    }

    calculateAreaUnderCurve(xCol, yCol) {
        // Group by x, average y, sort by x
        const groups = {};
        this.originalDf[xCol].forEach((x, i) => {
            const key = x.toFixed(10);
            if (!groups[key]) groups[key] = { x, ys: [] };
            groups[key].ys.push(this.originalDf[yCol][i]);
        });
        const sorted = Object.values(groups)
            .map(g => ({ x: g.x, y: g.ys.reduce((a, b) => a + b, 0) / g.ys.length }))
            .sort((a, b) => a.x - b.x);

        // Trapezoidal rule
        let area = 0;
        for (let i = 1; i < sorted.length; i++) {
            area += (sorted[i].x - sorted[i - 1].x) * (sorted[i].y + sorted[i - 1].y) / 2;
        }
        this.areaUnderCurve = area;
    }

    calculateMaxSlope(xCol, yCol) {
        // Filter data between 0.01 and 0.1
        const xArr = this.originalDf[xCol];
        const yArr = this.originalDf[yCol];
        const filtered = [];
        for (let i = 0; i < xArr.length; i++) {
            if (xArr[i] > 0.01 && xArr[i] < 0.1) {
                filtered.push({ x: xArr[i], y: yArr[i] });
            }
        }
        filtered.sort((a, b) => a.x - b.x);

        const ranges = [
            [0.01, 0.0325],
            [0.0325, 0.055],
            [0.055, 0.0775],
            [0.0775, 0.1]
        ];

        // Step 1: Find max slope from linear regression of segments
        let maxSlope = -Infinity;
        for (const [start, end] of ranges) {
            const segment = filtered.filter(p => p.x >= start && p.x <= end);
            if (segment.length < 2) continue;

            const n = segment.length;
            let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
            for (const p of segment) {
                sumX += p.x;
                sumY += p.y;
                sumXY += p.x * p.y;
                sumXX += p.x * p.x;
            }
            const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
            if (slope > maxSlope) maxSlope = slope;
        }

        if (maxSlope === -Infinity) return;
        this.maxSlope = maxSlope;

        // Step 2: Try offsets to find line passing through most points
        const allPoints = filtered.map(p => [p.x, p.y]);
        let bestOffset = null;
        let maxPointsCount = 0;
        let pointsOnBestLine = null;
        const tolerance = 0.05;

        for (const point of allPoints) {
            const offset = point[1] - maxSlope * point[0];
            const onLine = allPoints.map(p => Math.abs(p[1] - (maxSlope * p[0] + offset)) < tolerance);
            const count = onLine.filter(Boolean).length;
            if (count > maxPointsCount) {
                maxPointsCount = count;
                bestOffset = offset;
                pointsOnBestLine = onLine;
            }
        }

        // Step 3: Get min and max x-value points on the best line
        if (pointsOnBestLine) {
            const linePoints = allPoints.filter((_, i) => pointsOnBestLine[i]);
            let minXIdx = 0, maxXIdx = 0;
            for (let i = 1; i < linePoints.length; i++) {
                if (linePoints[i][0] < linePoints[minXIdx][0]) minXIdx = i;
                if (linePoints[i][0] > linePoints[maxXIdx][0]) maxXIdx = i;
            }

            const [x1, y1] = linePoints[minXIdx];
            const [x2, y2] = linePoints[maxXIdx];
            bestOffset = y1 - maxSlope * x1;

            this.originalSlopePointOne = [x1, y1];
            this.originalSlopePointTwo = [x2, y2];

            // Extended line points
            const xRange = x2 - x1;
            const x1Ext = x1 - xRange * 0.5;
            const x2Ext = x2 + xRange * 0.5;
            const y1Ext = maxSlope * x1Ext + bestOffset;
            const y2Ext = maxSlope * x2Ext + bestOffset;
            this.linePoints = [[x1Ext, y1Ext], [x2Ext, y2Ext]];
        }
    }
}

// ==================== App Controller ====================
class App {
    constructor() {
        this.processor = new DataProcessor();
        this.draggingPoint = null; // 0, 1, 2 or null
        this.exportData = [];
        this.bindEvents();
    }

    bindEvents() {
        document.getElementById('upload-btn').addEventListener('click', () => {
            document.getElementById('file-input').click();
        });
        document.getElementById('file-input').addEventListener('change', (e) => this.handleFile(e));
        document.getElementById('select-file-btn').addEventListener('click', () => {
            document.getElementById('file-input').click();
        });
        document.getElementById('reset-btn').addEventListener('click', () => this.resetPoints());
        document.getElementById('export-btn').addEventListener('click', () => this.exportToCSV());
    }

    handleFile(e) {
        const file = e.target.files[0];
        if (!file) return;
        document.getElementById('status-label').textContent = 'Processing file...';
        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                this.processor = new DataProcessor();
                this.processor.processFile(evt.target.result, file.name);
                this.showVizPage();
            } catch (err) {
                document.getElementById('status-label').textContent = 'Error: ' + err.message;
            }
        };
        reader.readAsText(file);
        // Reset so same file can be re-selected
        e.target.value = '';
    }

    showVizPage() {
        document.getElementById('landing-page').classList.add('hidden');
        document.getElementById('viz-page').classList.remove('hidden');
        document.getElementById('file-name-label').textContent = this.processor.fileName;

        const xCombo = document.getElementById('x-combo');
        const yCombo = document.getElementById('y-combo');
        xCombo.innerHTML = '';
        yCombo.innerHTML = '';
        this.processor.columns.forEach(col => {
            xCombo.innerHTML += `<option value="${col}">${col}</option>`;
            yCombo.innerHTML += `<option value="${col}">${col}</option>`;
        });
        xCombo.value = 'Display 1';

        // Change: auto-select Load column where first element < 0
        const preferredLoad = this.processor.getPreferredLoadColumn();
        yCombo.value = preferredLoad;

        // Remove old listeners and add new
        xCombo.onchange = () => this.updatePlot();
        yCombo.onchange = () => this.updatePlot();

        this.updatePlot();
    }

    updatePlot() {
        const xCol = document.getElementById('x-combo').value;
        const yCol = document.getElementById('y-combo').value;
        this.processor.setColumns(xCol, yCol);

        const xData = this.processor.originalDf[xCol];
        const yData = this.processor.originalDf[yCol];

        // Main scatter trace
        const scatterTrace = {
            x: xData,
            y: yData,
            mode: 'markers',
            type: 'scatter',
            marker: { color: '#1f77b4', size: 4, opacity: 0.5 },
            name: 'Data',
            hoverinfo: 'x+y'
        };

        // Max point
        const maxTrace = {
            x: [this.processor.maxX],
            y: [this.processor.maxValue],
            mode: 'markers',
            type: 'scatter',
            marker: { color: 'red', size: 12 },
            name: 'Maximum Strength',
            hoverinfo: 'x+y'
        };

        // Stiffness line (extended purple line)
        const [lp1, lp2] = this.processor.linePoints;
        const stiffnessTrace = {
            x: [lp1[0], lp2[0]],
            y: [lp1[1], lp2[1]],
            mode: 'lines',
            type: 'scatter',
            line: { color: 'purple', width: 2 },
            name: 'Stiffness',
            hoverinfo: 'skip'
        };

        // Interactive blue points (slope points)
        const [sp1, sp2] = [this.processor.customSlopePointOne, this.processor.customSlopePointTwo];
        const bluePtsTrace = {
            x: [sp1[0], sp2[0]],
            y: [sp1[1], sp2[1]],
            mode: 'markers',
            type: 'scatter',
            marker: { color: 'blue', size: 12 },
            name: 'Slope Points',
            hoverinfo: 'x+y'
        };

        // Interactive dashed line between blue points
        const dashedLineTrace = {
            x: [sp1[0], sp2[0]],
            y: [sp1[1], sp2[1]],
            mode: 'lines',
            type: 'scatter',
            line: { color: 'blue', width: 1, dash: 'dash' },
            showlegend: false,
            hoverinfo: 'skip'
        };

        // Interactive green yield point
        const yieldTrace = {
            x: [this.processor.yieldDisplacement],
            y: [this.processor.yieldStrength],
            mode: 'markers',
            type: 'scatter',
            marker: { color: 'green', size: 12 },
            name: 'Yield Point',
            hoverinfo: 'x+y'
        };

        // Annotations
        const annotations = [
            // Max point annotation
            {
                x: this.processor.maxX,
                y: this.processor.maxValue,
                xref: 'x', yref: 'y',
                text: `(${this.processor.maxX.toFixed(4)}, ${this.processor.maxValue.toFixed(4)})`,
                showarrow: true,
                arrowhead: 0,
                ax: 10, ay: -20,
                font: { color: 'red', size: 11 }
            },
            // Blue point 1 annotation
            {
                x: sp1[0], y: sp1[1],
                xref: 'x', yref: 'y',
                text: `(${sp1[0].toFixed(4)}, ${sp1[1].toFixed(4)})`,
                showarrow: true, arrowhead: 0,
                ax: 20, ay: -20,
                font: { color: 'blue', size: 11 },
                name: 'sp1ann'
            },
            // Blue point 2 annotation
            {
                x: sp2[0], y: sp2[1],
                xref: 'x', yref: 'y',
                text: `(${sp2[0].toFixed(4)}, ${sp2[1].toFixed(4)})`,
                showarrow: true, arrowhead: 0,
                ax: 20, ay: 20,
                font: { color: 'blue', size: 11 },
                name: 'sp2ann'
            },
            // Yield point annotation
            {
                x: this.processor.yieldDisplacement,
                y: this.processor.yieldStrength,
                xref: 'x', yref: 'y',
                text: `(${this.processor.yieldDisplacement.toFixed(4)}, ${this.processor.yieldStrength.toFixed(4)})`,
                showarrow: true, arrowhead: 0,
                ax: -80, ay: -20,
                font: { color: 'green', size: 11 },
                name: 'yieldann'
            },
            // Calculated max slope text box (top-left, purple to match stiffness line)
            {
                x: 0.02, y: 0.98,
                xref: 'paper', yref: 'paper',
                text: `Calculated Max Slope: ${this.processor.maxSlope.toFixed(4)}`,
                showarrow: false,
                font: { color: 'purple', size: 12 },
                bgcolor: 'white',
                bordercolor: 'purple',
                borderwidth: 1,
                borderpad: 6,
                xanchor: 'left', yanchor: 'top'
            },
            // Current slope text box
            {
                x: 0.02, y: 0.90,
                xref: 'paper', yref: 'paper',
                text: `Current Slope: ${this.processor.customSlope.toFixed(4)}`,
                showarrow: false,
                font: { color: 'blue', size: 12 },
                bgcolor: 'white',
                bordercolor: 'blue',
                borderwidth: 1,
                borderpad: 6,
                xanchor: 'left', yanchor: 'top',
                name: 'slopeann'
            },
            // Area text box
            {
                x: 0.02, y: 0.82,
                xref: 'paper', yref: 'paper',
                text: `Area: ${this.processor.areaUnderCurve.toFixed(4)}`,
                showarrow: false,
                font: { color: 'blue', size: 12 },
                bgcolor: 'white',
                bordercolor: 'blue',
                borderwidth: 1,
                borderpad: 6,
                xanchor: 'left', yanchor: 'top'
            }
        ];

        const layout = {
            xaxis: {
                title: yCol,
                gridcolor: '#e0e0e0',
                gridwidth: 1,
                zeroline: false
            },
            yaxis: {
                title: xCol,
                gridcolor: '#e0e0e0',
                gridwidth: 1,
                zeroline: false
            },
            showlegend: true,
            legend: { x: 0.7, y: 0.05, xanchor: 'left', yanchor: 'bottom' },
            margin: { l: 80, r: 40, t: 40, b: 80 },
            annotations: annotations,
            dragmode: false,
            hovermode: 'closest',
            plot_bgcolor: 'white',
            paper_bgcolor: 'white'
        };

        const traces = [scatterTrace, stiffnessTrace, dashedLineTrace, bluePtsTrace, maxTrace, yieldTrace];

        Plotly.newPlot('chart', traces, layout, {
            responsive: true,
            displayModeBar: false,
            scrollZoom: false
        });

        // Freeze axis ranges so dragging points doesn't rescale the graph
        const fullLayout = document.getElementById('chart')._fullLayout;
        Plotly.relayout('chart', {
            'xaxis.autorange': false,
            'xaxis.range': [...fullLayout.xaxis.range],
            'yaxis.autorange': false,
            'yaxis.range': [...fullLayout.yaxis.range]
        });

        this.setupDragInteraction();
    }

    setupDragInteraction() {
        const chartDiv = document.getElementById('chart');
        this.draggingPoint = null;

        // Clean up previous listeners
        if (this._dragAbort) this._dragAbort.abort();
        this._dragAbort = new AbortController();
        const signal = this._dragAbort.signal;

        const getPlotArea = () => chartDiv.querySelector('.nsewdrag');

        // Helper: convert data coords to pixel coords relative to plot area
        const dataToPx = (dataX, dataY) => {
            const xaxis = chartDiv._fullLayout.xaxis;
            const yaxis = chartDiv._fullLayout.yaxis;
            const plotArea = getPlotArea();
            if (!plotArea) return null;
            const rect = plotArea.getBoundingClientRect();
            const px = ((dataX - xaxis.range[0]) / (xaxis.range[1] - xaxis.range[0])) * rect.width;
            const py = ((yaxis.range[1] - dataY) / (yaxis.range[1] - yaxis.range[0])) * rect.height;
            return { px, py };
        };

        // Helper: convert mouse event to data coords
        const eventToData = (e) => {
            const xaxis = chartDiv._fullLayout.xaxis;
            const yaxis = chartDiv._fullLayout.yaxis;
            const plotArea = getPlotArea();
            if (!plotArea) return null;
            const rect = plotArea.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            const my = e.clientY - rect.top;
            return {
                dataX: xaxis.range[0] + (mx / rect.width) * (xaxis.range[1] - xaxis.range[0]),
                dataY: yaxis.range[1] - (my / rect.height) * (yaxis.range[1] - yaxis.range[0]),
                mx, my
            };
        };

        // Helper: check proximity to interactive points, returns index or null
        const hitTest = (e) => {
            const plotArea = getPlotArea();
            if (!plotArea) return null;
            const rect = plotArea.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            const my = e.clientY - rect.top;
            if (mx < 0 || my < 0 || mx > rect.width || my > rect.height) return null;

            const HIT_RADIUS = 20;
            const pts = [
                this.processor.customSlopePointOne,
                this.processor.customSlopePointTwo,
                [this.processor.yieldDisplacement, this.processor.yieldStrength]
            ];
            let best = null, bestDist = Infinity;
            for (let i = 0; i < pts.length; i++) {
                const pp = dataToPx(pts[i][0], pts[i][1]);
                if (!pp) continue;
                const d = Math.sqrt((mx - pp.px) ** 2 + (my - pp.py) ** 2);
                if (d < HIT_RADIUS && d < bestDist) { bestDist = d; best = i; }
            }
            return best;
        };

        // Lightweight DOM overlay for live coords/slope during drag (avoids heavy Plotly.relayout)
        const dragOverlay = document.getElementById('drag-overlay');

        // Attach mousedown directly on the Plotly overlay element (capture phase)
        // so it fires before Plotly's own handlers
        const plotArea = getPlotArea();
        if (plotArea) {
            plotArea.addEventListener('mousedown', (e) => {
                const hit = hitTest(e);
                if (hit !== null) {
                    this.draggingPoint = hit;
                    if (dragOverlay) { dragOverlay.classList.add('visible'); }
                    e.stopImmediatePropagation();
                    e.preventDefault();
                }
            }, { capture: true, signal });
        }

        // Track which point is currently highlighted to avoid redundant restyles
        let hoveredPoint = null;

        const highlightPoint = (idx) => {
            if (hoveredPoint === idx) return;
            // Reset previous highlight
            if (hoveredPoint !== null) {
                const traceIdx = hoveredPoint < 2 ? 3 : 5;
                Plotly.restyle(chartDiv, { 'marker.size': [12] }, [traceIdx]);
            }
            hoveredPoint = idx;
            // Apply new highlight
            if (idx !== null) {
                const traceIdx = idx < 2 ? 3 : 5;
                if (traceIdx === 3) {
                    // Two points in this trace - enlarge both for simplicity
                    Plotly.restyle(chartDiv, { 'marker.size': [18] }, [traceIdx]);
                } else {
                    Plotly.restyle(chartDiv, { 'marker.size': [18] }, [traceIdx]);
                }
            }
        };

        // Build a sorted index for binary search snapping (O(log n) instead of O(n))
        const xCol = document.getElementById('x-combo').value;
        const yCol = document.getElementById('y-combo').value;
        const xArr = this.processor.originalDf[xCol];
        const yArr = this.processor.originalDf[yCol];
        const sortedIndices = Array.from(xArr.keys()).sort((a, b) => xArr[a] - xArr[b]);

        const findClosestPoint = (dataX) => {
            let lo = 0, hi = sortedIndices.length - 1;
            while (lo < hi) {
                const mid = (lo + hi) >> 1;
                if (xArr[sortedIndices[mid]] < dataX) lo = mid + 1;
                else hi = mid;
            }
            // Check neighbors to find true closest
            let bestIdx = sortedIndices[lo];
            let bestDist = Math.abs(xArr[bestIdx] - dataX);
            if (lo > 0) {
                const prev = sortedIndices[lo - 1];
                const d = Math.abs(xArr[prev] - dataX);
                if (d < bestDist) { bestIdx = prev; bestDist = d; }
            }
            if (lo < sortedIndices.length - 1) {
                const next = sortedIndices[lo + 1];
                const d = Math.abs(xArr[next] - dataX);
                if (d < bestDist) { bestIdx = next; }
            }
            return bestIdx;
        };

        // Mousemove on document for dragging + cursor feedback + hover highlight
        let dragRAF = null;
        document.addEventListener('mousemove', (e) => {
            const overlay = getPlotArea();
            // Cursor feedback - set on the Plotly overlay so it's not overridden
            if (this.draggingPoint === null) {
                const hit = hitTest(e);
                if (overlay) overlay.style.cursor = hit !== null ? 'pointer' : '';
                highlightPoint(hit);
                return;
            }

            if (overlay) overlay.style.cursor = 'pointer';

            // Throttle drag updates to animation frame rate
            if (dragRAF) return;
            dragRAF = requestAnimationFrame(() => {
                dragRAF = null;
                const coords = eventToData(e);
                if (!coords || isNaN(coords.dataX) || isNaN(coords.dataY)) return;

                const closestIdx = findClosestPoint(coords.dataX);
                this.moveInteractivePoint(xArr[closestIdx], yArr[closestIdx]);
            });
        }, { signal });

        // Mouseup on document
        document.addEventListener('mouseup', () => {
            if (this.draggingPoint !== null) {
                if (dragOverlay) dragOverlay.classList.remove('visible');
                this.syncAnnotations();
                this.draggingPoint = null;
                const overlay = getPlotArea();
                if (overlay) overlay.style.cursor = '';
                highlightPoint(null);
            }
        }, { signal });
    }

    moveInteractivePoint(x, y) {
        const chartDiv = document.getElementById('chart');
        const dragOverlay = document.getElementById('drag-overlay');

        if (this.draggingPoint === 0 || this.draggingPoint === 1) {
            // Update blue slope point
            if (this.draggingPoint === 0) {
                this.processor.setCustomSlopePointOne(x, y);
            } else {
                this.processor.setCustomSlopePointTwo(x, y);
            }
            this.processor.calculateCustomSlope();

            const sp1 = this.processor.customSlopePointOne;
            const sp2 = this.processor.customSlopePointTwo;
            const xVals = [sp1[0], sp2[0]];
            const yVals = [sp1[1], sp2[1]];

            // Plotly.restyle only - lightweight trace update; annotations via DOM overlay
            Plotly.restyle(chartDiv, {
                x: [xVals, xVals],
                y: [yVals, yVals]
            }, [2, 3]);

            // Live feedback via DOM (cheap, no Plotly.relayout)
            if (dragOverlay) {
                const pt = this.draggingPoint === 0 ? sp1 : sp2;
                dragOverlay.textContent = `(${pt[0].toFixed(4)}, ${pt[1].toFixed(4)})\nCurrent Slope: ${this.processor.customSlope.toFixed(4)}`;
            }

        } else if (this.draggingPoint === 2) {
            this.processor.setYieldPoint(x, y);
            Plotly.restyle(chartDiv, {
                x: [[x]],
                y: [[y]]
            }, [5]);

            if (dragOverlay) {
                dragOverlay.textContent = `(${x.toFixed(4)}, ${y.toFixed(4)})`;
            }
        }
    }

    syncAnnotations() {
        const chartDiv = document.getElementById('chart');
        const annotations = chartDiv.layout.annotations.slice();
        const sp1 = this.processor.customSlopePointOne;
        const sp2 = this.processor.customSlopePointTwo;

        annotations[1] = { ...annotations[1], x: sp1[0], y: sp1[1], text: `(${sp1[0].toFixed(4)}, ${sp1[1].toFixed(4)})` };
        annotations[2] = { ...annotations[2], x: sp2[0], y: sp2[1], text: `(${sp2[0].toFixed(4)}, ${sp2[1].toFixed(4)})` };
        annotations[3] = { ...annotations[3], x: this.processor.yieldDisplacement, y: this.processor.yieldStrength, text: `(${this.processor.yieldDisplacement.toFixed(4)}, ${this.processor.yieldStrength.toFixed(4)})` };
        annotations[5] = { ...annotations[5], text: `Current Slope: ${this.processor.customSlope.toFixed(4)}` };

        Plotly.relayout(chartDiv, { annotations });
    }

    resetPoints() {
        this.processor.resetData();
        const chartDiv = document.getElementById('chart');
        const annotations = chartDiv.layout.annotations.slice();

        const sp1 = this.processor.customSlopePointOne;
        const sp2 = this.processor.customSlopePointTwo;
        const yx = this.processor.yieldDisplacement;
        const yy = this.processor.yieldStrength;

        // Update blue points and dashed line
        Plotly.restyle(chartDiv, { x: [[sp1[0], sp2[0]]], y: [[sp1[1], sp2[1]]] }, [3]);
        Plotly.restyle(chartDiv, { x: [[sp1[0], sp2[0]]], y: [[sp1[1], sp2[1]]] }, [2]);
        // Update yield point
        Plotly.restyle(chartDiv, { x: [[yx]], y: [[yy]] }, [5]);

        // Update annotations
        annotations[1] = { ...annotations[1], x: sp1[0], y: sp1[1], text: `(${sp1[0].toFixed(4)}, ${sp1[1].toFixed(4)})` };
        annotations[2] = { ...annotations[2], x: sp2[0], y: sp2[1], text: `(${sp2[0].toFixed(4)}, ${sp2[1].toFixed(4)})` };
        annotations[3] = { ...annotations[3], x: yx, y: yy, text: `(${yx.toFixed(4)}, ${yy.toFixed(4)})` };
        annotations[5] = { ...annotations[5], text: `Current Slope: ${this.processor.maxSlope.toFixed(4)}` };

        Plotly.relayout(chartDiv, { annotations: annotations });
    }

    exportToCSV() {
        const row = {
            'file name': this.processor.fileName,
            'slope': this.processor.customSlope,
            'area': this.processor.areaUnderCurve,
            'yield displacement': this.processor.yieldDisplacement,
            'yield strength': this.processor.yieldStrength,
            'max strength': this.processor.maxValue
        };
        this.exportData.push(row);

        const headers = Object.keys(row);
        let csv = headers.join(',') + '\n';
        this.exportData.forEach(r => {
            csv += headers.map(h => r[h]).join(',') + '\n';
        });

        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'mechanical property.csv';
        a.click();
        URL.revokeObjectURL(url);
    }
}

// Initialize
const app = new App();
