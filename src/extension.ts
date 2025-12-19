import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export function activate(context: vscode.ExtensionContext) {
    // Register command for context menu (when right-clicking a file)
    let disposable = vscode.commands.registerCommand('image-cropper.cropImage', async (uri: vscode.Uri) => {
        if (!uri) {
            vscode.window.showErrorMessage('No image file selected');
            return;
        }
        openCropper(uri);
    });

    // Register command for active editor (when image is already open)
    let disposable2 = vscode.commands.registerCommand('image-cropper.cropActiveImage', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor');
            return;
        }

        const uri = editor.document.uri;
        const ext = path.extname(uri.fsPath).toLowerCase();
        const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp'];

        if (!imageExtensions.includes(ext)) {
            vscode.window.showErrorMessage('Active file is not an image');
            return;
        }

        openCropper(uri);
    });

    context.subscriptions.push(disposable, disposable2);

    function openCropper(uri: vscode.Uri) {
        const panel = vscode.window.createWebviewPanel(
            'imageCropper',
            'Image Cropper',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [vscode.Uri.file(path.dirname(uri.fsPath))]
            }
        );

        const imageUri = panel.webview.asWebviewUri(uri);
        const imagePath = uri.fsPath;

        panel.webview.html = getWebviewContent(imageUri.toString(), path.basename(imagePath));

        panel.webview.onDidReceiveMessage(
            async message => {
                switch (message.command) {
                    case 'save':
                        await saveImage(imagePath, message.data, false);
                        break;
                    case 'saveAs':
                        await saveImage(imagePath, message.data, true);
                        break;
                }
            },
            undefined,
            context.subscriptions
        );
    }
}

async function saveImage(originalPath: string, data: any, saveAs: boolean) {
    try {
        const sharp = require('sharp');
        const imageBuffer = Buffer.from(data.imageData.split(',')[1], 'base64');

        let sharpInstance = sharp(imageBuffer);

        // Apply crop
        sharpInstance = sharpInstance.extract({
            left: Math.round(data.crop.x),
            top: Math.round(data.crop.y),
            width: Math.round(data.crop.width),
            height: Math.round(data.crop.height)
        });

        // Apply compression if specified
        if (data.quality < 100) {
            const ext = path.extname(originalPath).toLowerCase();
            if (ext === '.jpg' || ext === '.jpeg') {
                sharpInstance = sharpInstance.jpeg({ quality: data.quality });
            } else if (ext === '.png') {
                sharpInstance = sharpInstance.png({ quality: data.quality });
            } else if (ext === '.webp') {
                sharpInstance = sharpInstance.webp({ quality: data.quality });
            }
        }

        const outputBuffer = await sharpInstance.toBuffer();

        let savePath = originalPath;

        if (saveAs) {
            const ext = path.extname(originalPath);
            const defaultName = path.basename(originalPath, ext) + '_cropped' + ext;
            const uri = await vscode.window.showSaveDialog({
                defaultUri: vscode.Uri.file(path.join(path.dirname(originalPath), defaultName)),
                filters: {
                    'Images': ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp']
                }
            });

            if (!uri) {
                return;
            }
            savePath = uri.fsPath;
        }

        fs.writeFileSync(savePath, outputBuffer);
        const fileSize = (outputBuffer.length / 1024).toFixed(2);

        vscode.window.showInformationMessage(
            `Image saved successfully! Size: ${fileSize} KB`
        );
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to save image: ${error}`);
    }
}

function getWebviewContent(imageUri: string, imageName: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Image Cropper</title>
    <style>
        body {
            margin: 0;
            padding: 0;
            display: flex;
            height: 100vh;
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background: var(--vscode-editor-background);
        }
        .main-container {
            width: 80%;
            height: 100%;
            display: flex;
            flex-direction: column;
            gap: 10px;
            padding: 20px;
        }
        .canvas-container {
            position: relative;
            border: 1px solid var(--vscode-panel-border);
            overflow: auto;
            flex: 1;
            background: #222;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        canvas {
            cursor: crosshair;
            max-width: 100%;
            max-height: 100%;
            object-fit: contain;
        }
        .sidebar {
            width: 20%;
            height: 100%;
            display: flex;
            flex-direction: column;
            gap: 15px;
            padding: 15px;
            background: var(--vscode-sideBar-background);
            border: 1px solid var(--vscode-panel-border);
            overflow-y: auto;
        }
        .input-group {
            display: flex;
            flex-direction: column;
            gap: 5px;
        }
        label {
            font-size: 13px;
            font-weight: 500;
        }
        input, select {
            padding: 6px 8px;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 2px;
        }
        button {
            padding: 8px 16px;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            cursor: pointer;
            border-radius: 2px;
            font-weight: 500;
        }
        button:hover {
            background: var(--vscode-button-hoverBackground);
        }
        .button-group {
            display: flex;
            gap: 10px;
        }
        .info {
            padding: 10px;
            background: var(--vscode-textBlockQuote-background);
            border-left: 3px solid var(--vscode-textLink-foreground);
            font-size: 12px;
        }
        h3 {
            margin: 0 0 10px 0;
            font-size: 14px;
        }
    </style>
</head>
<body>
    <div class="main-container">
        <h2>${imageName}</h2>
        <div class="canvas-container">
            <canvas id="canvas"></canvas>
        </div>
    </div>
    
    <div class="sidebar">
        <h3>Crop Settings</h3>
        
        <div class="input-group">
            <label>Aspect Ratio</label>
            <select id="ratioSelect">
                <option value="free">Free</option>
                <option value="1:1">1:1 (Square)</option>
                <option value="4:3">4:3</option>
                <option value="16:9">16:9</option>
                <option value="3:2">3:2</option>
                <option value="custom">Custom</option>
            </select>
        </div>

        <div class="input-group" id="customRatioGroup" style="display: none;">
            <label>Custom Ratio (W:H)</label>
            <div style="display: flex; gap: 5px; align-items: center;">
                <input type="number" id="ratioW" placeholder="Width" min="1" style="flex: 1;">
                <span>:</span>
                <input type="number" id="ratioH" placeholder="Height" min="1" style="flex: 1;">
            </div>
        </div>
        
        <div class="input-group">
            <label>Width (px)</label>
            <input type="number" id="widthInput" placeholder="Width" min="1">
        </div>
        
        <div class="input-group">
            <label>Height (px)</label>
            <input type="number" id="heightInput" placeholder="Height" min="1">
        </div>

        <div class="input-group">
            <label>Compression Quality (1-100)</label>
            <input type="range" id="qualitySlider" min="1" max="100" value="100">
            <span id="qualityValue">100%</span>
        </div>
        
        <div class="info">
            <strong>Selection:</strong><br>
            X: <span id="selX">0</span>, Y: <span id="selY">0</span><br>
            W: <span id="selW">0</span>, H: <span id="selH">0</span>
        </div>

        <div class="info" id="sizeInfo" style="display: none;">
            <strong>Estimated Size:</strong><br>
            <span id="fileSize">-</span>
        </div>
        
        <div class="button-group">
            <button onclick="save()" style="flex: 1;">Save</button>
            <button onclick="saveAs()" style="flex: 1;">Save As</button>
        </div>

        <button onclick="resetSelection()">Reset Selection</button>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        const canvas = document.getElementById('canvas');
        const ctx = canvas.getContext('2d');
        const img = new Image();
        
        let selection = { x: 0, y: 0, width: 0, height: 0 };
        let isDrawing = false;
        let startX, startY;
        let aspectRatio = null;
        let isDragging = false;
        let dragOffsetX = 0;
        let dragOffsetY = 0;
        let isResizing = false;
        let resizeCorner = null; // 'nw', 'ne', 'sw', 'se'
        let resizeStartSelection = null;

        const CORNER_SIZE = 10; // Size of the corner hit area in pixels

        img.onload = () => {
            canvas.width = img.width;
            canvas.height = img.height;
            drawImage();
        };
        img.src = '${imageUri}';

        // Ratio selection
        document.getElementById('ratioSelect').addEventListener('change', (e) => {
            const val = e.target.value;
            const customGroup = document.getElementById('customRatioGroup');
            
            if (val === 'custom') {
                customGroup.style.display = 'flex';
                updateAspectRatio();
            } else {
                customGroup.style.display = 'none';
                if (val === 'free') {
                    aspectRatio = null;
                } else {
                    const [w, h] = val.split(':').map(Number);
                    aspectRatio = w / h;
                }
            }
            updateSelection();
        });

        document.getElementById('ratioW').addEventListener('input', updateAspectRatio);
        document.getElementById('ratioH').addEventListener('input', updateAspectRatio);

        function updateAspectRatio() {
            const w = parseFloat(document.getElementById('ratioW').value);
            const h = parseFloat(document.getElementById('ratioH').value);
            if (w > 0 && h > 0) {
                aspectRatio = w / h;
            }
        }

        // Width/Height inputs
        document.getElementById('widthInput').addEventListener('input', (e) => {
            const w = parseFloat(e.target.value);
            if (w > 0) {
                selection.width = w;
                if (aspectRatio) {
                    selection.height = w / aspectRatio;
                    document.getElementById('heightInput').value = Math.round(selection.height);
                }
                updateSelection();
            }
        });

        document.getElementById('heightInput').addEventListener('input', (e) => {
            const h = parseFloat(e.target.value);
            if (h > 0) {
                selection.height = h;
                if (aspectRatio) {
                    selection.width = h * aspectRatio;
                    document.getElementById('widthInput').value = Math.round(selection.width);
                }
                updateSelection();
            }
        });

        // Quality slider
        document.getElementById('qualitySlider').addEventListener('input', (e) => {
            document.getElementById('qualityValue').textContent = e.target.value + '%';
            estimateSize();
        });

        // Get canvas coordinates from mouse event
        function getCanvasCoordinates(e) {
            const rect = canvas.getBoundingClientRect();
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;
            
            return {
                x: (e.clientX - rect.left) * scaleX,
                y: (e.clientY - rect.top) * scaleY
            };
        }

        // Check which corner is near the mouse
        function getCornerAtPosition(x, y) {
            if (selection.width === 0 || selection.height === 0) return null;
            
            const corners = {
                'nw': { x: selection.x, y: selection.y },
                'ne': { x: selection.x + selection.width, y: selection.y },
                'sw': { x: selection.x, y: selection.y + selection.height },
                'se': { x: selection.x + selection.width, y: selection.y + selection.height }
            };
            
            for (let corner in corners) {
                const cx = corners[corner].x;
                const cy = corners[corner].y;
                const distance = Math.sqrt(Math.pow(x - cx, 2) + Math.pow(y - cy, 2));
                
                if (distance <= CORNER_SIZE) {
                    return corner;
                }
            }
            
            return null;
        }

        // Check if point is inside selection (not near corners)
        function isInsideSelection(x, y) {
            if (selection.width === 0 || selection.height === 0) return false;
            
            // First check if we're near a corner
            if (getCornerAtPosition(x, y)) return false;
            
            return x >= selection.x && x <= selection.x + selection.width &&
                   y >= selection.y && y <= selection.y + selection.height;
        }

        // Get cursor style for corner
        function getCursorForCorner(corner) {
            const cursors = {
                'nw': 'nwse-resize',
                'ne': 'nesw-resize',
                'sw': 'nesw-resize',
                'se': 'nwse-resize'
            };
            return cursors[corner] || 'default';
        }

        canvas.addEventListener('mousedown', (e) => {
            const coords = getCanvasCoordinates(e);
            const mouseX = coords.x;
            const mouseY = coords.y;
            
            // Check if clicking on a corner
            const corner = getCornerAtPosition(mouseX, mouseY);
            if (corner) {
                isResizing = true;
                resizeCorner = corner;
                resizeStartSelection = { ...selection };
                startX = mouseX;
                startY = mouseY;
                return;
            }
            
            // Check if click is inside existing selection
            if (isInsideSelection(mouseX, mouseY)) {
                // Start dragging
                isDragging = true;
                dragOffsetX = mouseX - selection.x;
                dragOffsetY = mouseY - selection.y;
                canvas.style.cursor = 'move';
            } else {
                // Start new selection from mouse position
                isDrawing = true;
                startX = mouseX;
                startY = mouseY;
                selection = { x: mouseX, y: mouseY, width: 0, height: 0 };
            }
        });

        canvas.addEventListener('mousemove', (e) => {
            const coords = getCanvasCoordinates(e);
            const mouseX = coords.x;
            const mouseY = coords.y;
            
            // Update cursor based on position
            if (!isDrawing && !isDragging && !isResizing) {
                const corner = getCornerAtPosition(mouseX, mouseY);
                if (corner) {
                    canvas.style.cursor = getCursorForCorner(corner);
                } else if (isInsideSelection(mouseX, mouseY)) {
                    canvas.style.cursor = 'move';
                } else {
                    canvas.style.cursor = 'crosshair';
                }
            }
            
            if (isResizing) {
                const deltaX = mouseX - startX;
                const deltaY = mouseY - startY;
                
                let newSelection = { ...resizeStartSelection };
                
                switch (resizeCorner) {
                    case 'nw':
                        newSelection.x = resizeStartSelection.x + deltaX;
                        newSelection.y = resizeStartSelection.y + deltaY;
                        newSelection.width = resizeStartSelection.width - deltaX;
                        newSelection.height = resizeStartSelection.height - deltaY;
                        break;
                    case 'ne':
                        newSelection.y = resizeStartSelection.y + deltaY;
                        newSelection.width = resizeStartSelection.width + deltaX;
                        newSelection.height = resizeStartSelection.height - deltaY;
                        break;
                    case 'sw':
                        newSelection.x = resizeStartSelection.x + deltaX;
                        newSelection.width = resizeStartSelection.width - deltaX;
                        newSelection.height = resizeStartSelection.height + deltaY;
                        break;
                    case 'se':
                        newSelection.width = resizeStartSelection.width + deltaX;
                        newSelection.height = resizeStartSelection.height + deltaY;
                        break;
                }
                
                // Apply aspect ratio if set
                if (aspectRatio) {
                    if (Math.abs(newSelection.width) > Math.abs(newSelection.height * aspectRatio)) {
                        newSelection.height = newSelection.width / aspectRatio;
                    } else {
                        newSelection.width = newSelection.height * aspectRatio;
                    }
                    
                    // Adjust position for corners that move both x and y
                    if (resizeCorner === 'nw') {
                        newSelection.x = resizeStartSelection.x + resizeStartSelection.width - newSelection.width;
                        newSelection.y = resizeStartSelection.y + resizeStartSelection.height - newSelection.height;
                    } else if (resizeCorner === 'ne') {
                        newSelection.y = resizeStartSelection.y + resizeStartSelection.height - newSelection.height;
                    } else if (resizeCorner === 'sw') {
                        newSelection.x = resizeStartSelection.x + resizeStartSelection.width - newSelection.width;
                    }
                }
                
                // Ensure minimum size and keep within canvas bounds
                if (newSelection.width > 10 && newSelection.height > 10 &&
                    newSelection.x >= 0 && newSelection.y >= 0 &&
                    newSelection.x + newSelection.width <= canvas.width &&
                    newSelection.y + newSelection.height <= canvas.height) {
                    selection = newSelection;
                }
                
                updateSelection();
                return;
            }
            
            if (isDragging) {
                // Move the selection
                let newX = mouseX - dragOffsetX;
                let newY = mouseY - dragOffsetY;
                
                // Constrain to canvas bounds
                newX = Math.max(0, Math.min(newX, canvas.width - selection.width));
                newY = Math.max(0, Math.min(newY, canvas.height - selection.height));
                
                selection.x = newX;
                selection.y = newY;
                updateSelection();
                return;
            }
            
            if (!isDrawing) return;
            
            let width = mouseX - startX;
            let height = mouseY - startY;
            
            if (aspectRatio) {
                if (Math.abs(width) > Math.abs(height)) {
                    height = width / aspectRatio;
                } else {
                    width = height * aspectRatio;
                }
            }
            
            // Handle negative dimensions (drawing in reverse direction)
            if (width < 0) {
                selection.x = startX + width;
                selection.width = -width;
            } else {
                selection.x = startX;
                selection.width = width;
            }
            
            if (height < 0) {
                selection.y = startY + height;
                selection.height = -height;
            } else {
                selection.y = startY;
                selection.height = height;
            }
            
            updateSelection();
        });

        canvas.addEventListener('mouseup', () => {
            isDrawing = false;
            isDragging = false;
            isResizing = false;
            resizeCorner = null;
            resizeStartSelection = null;
            canvas.style.cursor = 'crosshair';
            
            if (selection.width > 0 && selection.height > 0) {
                document.getElementById('widthInput').value = Math.round(selection.width);
                document.getElementById('heightInput').value = Math.round(selection.height);
                estimateSize();
            }
        });

        canvas.addEventListener('mouseleave', () => {
            isDrawing = false;
            isDragging = false;
            isResizing = false;
            resizeCorner = null;
            resizeStartSelection = null;
            canvas.style.cursor = 'crosshair';
        });

        function drawImage() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0);
            
            if (selection.width > 0 && selection.height > 0) {
                // Darken outside selection
                ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
                ctx.fillRect(0, 0, canvas.width, selection.y);
                ctx.fillRect(0, selection.y, selection.x, selection.height);
                ctx.fillRect(selection.x + selection.width, selection.y, 
                    canvas.width - selection.x - selection.width, selection.height);
                ctx.fillRect(0, selection.y + selection.height, canvas.width, 
                    canvas.height - selection.y - selection.height);
                
                // Draw selection border
                ctx.strokeStyle = '#00ff00';
                ctx.lineWidth = 2;
                ctx.strokeRect(selection.x, selection.y, selection.width, selection.height);
                
                // Draw corner handles
                const cornerSize = 8;
                ctx.fillStyle = '#00ff00';
                
                // Top-left
                ctx.fillRect(selection.x - cornerSize/2, selection.y - cornerSize/2, cornerSize, cornerSize);
                // Top-right
                ctx.fillRect(selection.x + selection.width - cornerSize/2, selection.y - cornerSize/2, cornerSize, cornerSize);
                // Bottom-left
                ctx.fillRect(selection.x - cornerSize/2, selection.y + selection.height - cornerSize/2, cornerSize, cornerSize);
                // Bottom-right
                ctx.fillRect(selection.x + selection.width - cornerSize/2, selection.y + selection.height - cornerSize/2, cornerSize, cornerSize);
            }
        }

        function updateSelection() {
            document.getElementById('selX').textContent = Math.round(selection.x);
            document.getElementById('selY').textContent = Math.round(selection.y);
            document.getElementById('selW').textContent = Math.round(selection.width);
            document.getElementById('selH').textContent = Math.round(selection.height);
            drawImage();
        }

        function estimateSize() {
            if (selection.width > 0 && selection.height > 0) {
                const area = selection.width * selection.height;
                const quality = parseInt(document.getElementById('qualitySlider').value) / 100;
                const estimatedBytes = area * 3 * quality; // Rough estimation
                const estimatedKB = (estimatedBytes / 1024).toFixed(2);
                document.getElementById('fileSize').textContent = estimatedKB + ' KB (estimated)';
                document.getElementById('sizeInfo').style.display = 'block';
            }
        }

        function resetSelection() {
            selection = { x: 0, y: 0, width: 0, height: 0 };
            document.getElementById('widthInput').value = '';
            document.getElementById('heightInput').value = '';
            document.getElementById('sizeInfo').style.display = 'none';
            updateSelection();
        }

        function save() {
            if (selection.width === 0 || selection.height === 0) {
                alert('Please select an area to crop');
                return;
            }
            sendCropData('save');
        }

        function saveAs() {
            if (selection.width === 0 || selection.height === 0) {
                alert('Please select an area to crop');
                return;
            }
            sendCropData('saveAs');
        }

        function sendCropData(command) {
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = img.width;
            tempCanvas.height = img.height;
            const tempCtx = tempCanvas.getContext('2d');
            tempCtx.drawImage(img, 0, 0);
            
            vscode.postMessage({
                command: command,
                data: {
                    crop: selection,
                    imageData: tempCanvas.toDataURL('image/png'),
                    quality: parseInt(document.getElementById('qualitySlider').value)
                }
            });
        }
    </script>
</body>
</html>`;
}

export function deactivate() { }