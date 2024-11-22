import * as vscode from 'vscode';
import { XMLParser } from 'fast-xml-parser';

class AndroidXMLPreview {
    private static readonly viewType = 'xmlVectorViewer.preview';

    public static createOrShow(context: vscode.ExtensionContext, uri: vscode.Uri) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        const panel = vscode.window.createWebviewPanel(
            this.viewType,
            'Android XML Preview',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        this.updatePreview(panel, uri);

        // Handle changes to the document
        const changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument(e => {
            if (e.document.uri.toString() === uri.toString()) {
                this.updatePreview(panel, uri);
            }
        });

        panel.onDidDispose(() => {
            changeDocumentSubscription.dispose();
        });
    }

    private static async updatePreview(panel: vscode.WebviewPanel, uri: vscode.Uri) {
        try {
            const xmlContent = await vscode.workspace.fs.readFile(uri);
            const xmlString = Buffer.from(xmlContent).toString('utf-8');
            
            const parser = new XMLParser({
                ignoreAttributes: false,
                attributeNamePrefix: '',
                removeNSPrefix: true,
                parseAttributeValue: true,
                isArray: (name) => {
                    return ['path', 'group'].includes(name);
                },
                attributeValueProcessor: (name, value) => {
                    // Handle dimension values (e.g., 24dp -> 24)
                    if (typeof value === 'string' && value.endsWith('dp')) {
                        return parseFloat(value);
                    }
                    // Handle color values
                    if (typeof value === 'string' && value.startsWith('#')) {
                        return value;
                    }
                    return value;
                }
            });
            
            const parsed = parser.parse(xmlString);
            console.log('Parsed XML:', JSON.stringify(parsed, null, 2));

            if (parsed.vector) {
                panel.webview.html = this.getVectorDrawableHtml(this.convertVectorToSVG(parsed.vector));
            } else {
                // Find the root layout element
                const rootElement = Object.entries(parsed).find(([key]) => {
                    const normalizedKey = key.toLowerCase();
                    return normalizedKey.includes('layout') || 
                           normalizedKey.includes('constraint') ||
                           normalizedKey.includes('linear') ||
                           normalizedKey.includes('relative') ||
                           normalizedKey.includes('frame') ||
                           normalizedKey.includes('coordinator');
                });

                if (!rootElement) {
                    throw new Error('No valid root layout element found');
                }

                const [rootType, rootProps] = rootElement;
                panel.webview.html = this.getLayoutPreviewHtml(this.convertLayoutToHtml(rootType, rootProps));
            }
        } catch (error: any) {
            console.error('Error processing XML:', error);
            panel.webview.html = this.getErrorHtml(`Failed to process XML: ${error?.message || 'Unknown error'}`);
        }
    }

    private static convertVectorToSVG(vector: any): string {
        const width = vector.width || 24;
        const height = vector.height || 24;
        const viewportWidth = vector.viewportWidth || width;
        const viewportHeight = vector.viewportHeight || height;
        const alpha = vector.alpha !== undefined ? vector.alpha : 1;

        let paths = '';
        if (vector.path) {
            const pathArray = Array.isArray(vector.path) ? vector.path : [vector.path];
            pathArray.forEach((path: any) => {
                const pathData = path.pathData;
                const fillColor = path.fillColor || '#000000';
                const fillAlpha = path.fillAlpha !== undefined ? path.fillAlpha : alpha;
                paths += `<path d="${pathData}" fill="${fillColor}" fill-opacity="${fillAlpha}"/>`;
            });
        }

        if (vector.group) {
            const groups = Array.isArray(vector.group) ? vector.group : [vector.group];
            groups.forEach((group: any) => {
                let transform = '';
                if (group.translateX || group.translateY) {
                    transform += `translate(${group.translateX || 0},${group.translateY || 0})`;
                }
                if (group.rotation) {
                    const pivotX = group.pivotX || 0;
                    const pivotY = group.pivotY || 0;
                    transform += ` rotate(${group.rotation},${pivotX},${pivotY})`;
                }

                if (group.path) {
                    const groupPaths = Array.isArray(group.path) ? group.path : [group.path];
                    groupPaths.forEach((path: any) => {
                        const pathData = path.pathData;
                        const fillColor = path.fillColor || '#000000';
                        const fillAlpha = path.fillAlpha !== undefined ? path.fillAlpha : alpha;
                        paths += `<path d="${pathData}" fill="${fillColor}" fill-opacity="${fillAlpha}" ${transform ? `transform="${transform}"` : ''}/>`;
                    });
                }
            });
        }

        return `<svg xmlns="http://www.w3.org/2000/svg" 
                     width="100%" 
                     height="100%"
                     viewBox="0 0 ${viewportWidth} ${viewportHeight}"
                     preserveAspectRatio="xMidYMid meet">
                    ${paths}
                </svg>`;
    }

    private static convertLayoutToHtml(type: string, props: any): string {
        return `
            <div class="layout-root">
                ${this.renderLayoutElement(type, props)}
            </div>
        `;
    }

    private static renderLayoutElement(type: string, props: any): string {
        const elementName = type.split('.').pop() || type;
        const id = props.id ? props.id.replace(/^@\+id\//, '') : '';
        const width = this.convertLayoutDimension(props.layout_width);
        const height = this.convertLayoutDimension(props.layout_height);
        const margin = this.getMarginStyle(props);
        const padding = this.getPaddingStyle(props);
        const constraints = this.getConstraintStyles(props);
        
        let style = `
            position: relative;
            width: ${width};
            height: ${height};
            margin: ${margin};
            padding: ${padding};
            background-color: rgba(255, 255, 255, 0.1);
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 4px;
            ${constraints}
        `;

        let content = '';
        
        // Handle different view types
        if (type.includes('TextView')) {
            content = `<div class="text-content">${props.text || '[Text]'}</div>`;
        } else if (type.includes('Button') || type.includes('FloatingActionButton')) {
            const icon = props.src ? `[${props.src}]` : '';
            const text = props.contentDescription || props.text || icon || '[Button]';
            content = `<div class="button-content">${text}</div>`;
        } else if (type.includes('ImageView') || type.includes('PreviewView')) {
            content = `<div class="image-placeholder">[Image]</div>`;
        }

        // Handle child elements
        if (props) {
            Object.entries(props).forEach(([key, value]) => {
                if (typeof value === 'object' && value !== null && !key.startsWith('android:') && !key.startsWith('app:')) {
                    content += this.renderLayoutElement(key, value);
                }
            });
        }

        return `
            <div class="layout-element" style="${style}" ${id ? `id="${id}"` : ''}>
                <div class="element-info">
                    <span class="element-type">${elementName}</span>
                    ${id ? `<span class="element-id">#${id}</span>` : ''}
                </div>
                ${content}
            </div>
        `;
    }

    private static convertLayoutDimension(value: any): string {
        if (!value || value === 'wrap_content' || value === '-2') {
            return 'auto';
        }
        if (value === 'match_parent' || value === '-1' || value === 'fill_parent') {
            return '100%';
        }
        if (typeof value === 'string') {
            if (value.endsWith('dp')) {
                return `${parseInt(value)}px`;
            }
            if (value.endsWith('sp')) {
                return `${parseInt(value)}px`;
            }
        }
        return typeof value === 'number' ? `${value}px` : 'auto';
    }

    private static getMarginStyle(props: any): string {
        const margin = props.layout_margin || '0';
        const marginLeft = props.layout_marginLeft || props.layout_marginStart || margin;
        const marginRight = props.layout_marginRight || props.layout_marginEnd || margin;
        const marginTop = props.layout_marginTop || margin;
        const marginBottom = props.layout_marginBottom || margin;

        return `${this.convertLayoutDimension(marginTop)} ${this.convertLayoutDimension(marginRight)} ${this.convertLayoutDimension(marginBottom)} ${this.convertLayoutDimension(marginLeft)}`;
    }

    private static getPaddingStyle(props: any): string {
        const padding = props.padding || '8px';
        const paddingLeft = props.paddingLeft || props.paddingStart || padding;
        const paddingRight = props.paddingRight || props.paddingEnd || padding;
        const paddingTop = props.paddingTop || padding;
        const paddingBottom = props.paddingBottom || padding;

        return `${this.convertLayoutDimension(paddingTop)} ${this.convertLayoutDimension(paddingRight)} ${this.convertLayoutDimension(paddingBottom)} ${this.convertLayoutDimension(paddingLeft)}`;
    }

    private static getConstraintStyles(props: any): string {
        let style = '';
        
        // Handle constraint layout properties
        if (props.layout_constraintTop_toTopOf) {
            style += 'top: 0;';
        }
        if (props.layout_constraintBottom_toBottomOf) {
            style += 'bottom: 0;';
        }
        if (props.layout_constraintStart_toStartOf || props.layout_constraintLeft_toLeftOf) {
            style += 'left: 0;';
        }
        if (props.layout_constraintEnd_toEndOf || props.layout_constraintRight_toRightOf) {
            style += 'right: 0;';
        }
        if (props.layout_constraintCenterHorizontally) {
            style += 'left: 50%; transform: translateX(-50%);';
        }
        if (props.layout_constraintCenterVertically) {
            style += 'top: 50%; transform: translateY(-50%);';
        }

        return style;
    }

    private static getVectorDrawableHtml(svg: string): string {
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    body {
                        margin: 0;
                        padding: 20px;
                        background-color: #2d2d2d;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        min-height: 100vh;
                    }
                    .preview-container {
                        background-color: #1e1e1e;
                        padding: 20px;
                        border-radius: 8px;
                        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                    }
                    .svg-container {
                        width: 200px;
                        height: 200px;
                        background-color: #333333;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        border-radius: 4px;
                        margin-bottom: 16px;
                    }
                    .controls {
                        display: flex;
                        justify-content: center;
                        gap: 8px;
                    }
                    button {
                        background: #444444;
                        border: none;
                        color: white;
                        padding: 4px 12px;
                        border-radius: 4px;
                        cursor: pointer;
                    }
                    button:hover {
                        background: #555555;
                    }
                    #size-display {
                        color: #ffffff;
                        font-family: system-ui;
                        padding: 4px 8px;
                    }
                </style>
            </head>
            <body>
                <div class="preview-container">
                    <div class="svg-container">
                        ${svg}
                    </div>
                    <div class="controls">
                        <button onclick="adjustSize(-20)">-</button>
                        <span id="size-display">200px</span>
                        <button onclick="adjustSize(20)">+</button>
                    </div>
                </div>
                <script>
                    function adjustSize(delta) {
                        const container = document.querySelector('.svg-container');
                        const display = document.getElementById('size-display');
                        const currentSize = parseInt(container.style.width) || 200;
                        const newSize = Math.max(100, Math.min(400, currentSize + delta));
                        
                        container.style.width = newSize + 'px';
                        container.style.height = newSize + 'px';
                        display.textContent = newSize + 'px';
                    }

                    // Set initial size
                    document.querySelector('.svg-container').style.width = '200px';
                    document.querySelector('.svg-container').style.height = '200px';
                </script>
            </body>
            </html>`;
    }

    private static getLayoutPreviewHtml(layoutContent: string): string {
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    body {
                        margin: 0;
                        padding: 20px;
                        background-color: #2d2d2d;
                        color: #ffffff;
                        font-family: system-ui;
                    }
                    .layout-root {
                        width: 360px;
                        min-height: 640px;
                        margin: 0 auto;
                        background-color: #1e1e1e;
                        border: 2px solid #3d3d3d;
                        border-radius: 8px;
                        padding: 16px;
                        position: relative;
                    }
                    .layout-element {
                        box-sizing: border-box;
                    }
                    .element-info {
                        position: absolute;
                        top: 0;
                        left: 0;
                        font-size: 12px;
                        padding: 2px 4px;
                        background-color: rgba(0, 0, 0, 0.6);
                        border-radius: 2px;
                        z-index: 1;
                    }
                    .element-type {
                        color: #4CAF50;
                    }
                    .element-id {
                        color: #2196F3;
                        margin-left: 4px;
                    }
                    .text-content {
                        margin-top: 24px;
                        padding: 8px;
                        background-color: rgba(255, 255, 255, 0.1);
                        border-radius: 4px;
                    }
                    .button-content {
                        margin-top: 24px;
                        padding: 8px 16px;
                        background-color: #4CAF50;
                        display: inline-block;
                        border-radius: 4px;
                    }
                    .image-placeholder {
                        margin-top: 24px;
                        width: 48px;
                        height: 48px;
                        background-color: rgba(255, 255, 255, 0.1);
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        border-radius: 4px;
                    }
                </style>
            </head>
            <body>
                ${layoutContent}
            </body>
            </html>`;
    }

    private static getErrorHtml(message: string): string {
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <style>
                    body {
                        margin: 0;
                        padding: 20px;
                        background-color: #2d2d2d;
                        color: #e74c3c;
                        font-family: system-ui;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        min-height: 100vh;
                    }
                    .error-container {
                        background-color: #1e1e1e;
                        padding: 20px;
                        border-radius: 8px;
                        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                        text-align: center;
                    }
                </style>
            </head>
            <body>
                <div class="error-container">
                    <h3>${message}</h3>
                </div>
            </body>
            </html>`;
    }
}

export function activate(context: vscode.ExtensionContext) {
    let disposable = vscode.commands.registerCommand('xmlVectorViewer.openPreview', () => {
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor) {
            AndroidXMLPreview.createOrShow(context, activeEditor.document.uri);
        } else {
            vscode.window.showErrorMessage('Please open an XML file first');
        }
    });

    context.subscriptions.push(disposable);
}
