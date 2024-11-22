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
            
            console.log('Processing XML:', xmlString);

            const parser = new XMLParser({
                ignoreAttributes: false,
                attributeNamePrefix: '',
                removeNSPrefix: true,
                parseAttributeValue: false,
                isArray: (name) => {
                    // These elements might appear multiple times
                    return ['item', 'path'].includes(name);
                }
            });
            
            const parsed = parser.parse(xmlString);
            console.log('Parsed XML:', JSON.stringify(parsed, null, 2));

            if (parsed.vector) {
                panel.webview.html = this.getVectorDrawableHtml(this.convertVectorToSVG(parsed));
            } else {
                // Find the root layout element
                const rootElement = Object.entries(parsed).find(([key]) => 
                    key.includes('Layout') || 
                    key.includes('androidx.') || 
                    key.includes('android.widget.') ||
                    key.includes('com.google.android.material.')
                );

                if (!rootElement) {
                    throw new Error('No valid root element found');
                }

                const [rootType, rootProps] = rootElement;
                panel.webview.html = this.getLayoutPreviewHtml(this.convertLayoutToHtml(rootType, rootProps));
            }
        } catch (error: any) {
            console.error('Error processing XML:', error);
            panel.webview.html = this.getErrorHtml(`Failed to process XML: ${error?.message || 'Unknown error'}`);
        }
    }

    private static convertVectorToSVG(vectorDrawable: any): string {
        if (!vectorDrawable.vector) {
            return '<svg><text fill="red">Invalid vector drawable format</text></svg>';
        }

        const vector = vectorDrawable.vector;
        const viewportWidth = vector.viewportWidth || '24';
        const viewportHeight = vector.viewportHeight || '24';

        let paths = '';
        try {
            if (vector.path) {
                const pathArray = Array.isArray(vector.path) ? vector.path : [vector.path];
                paths += this.convertVectorPaths(pathArray);
            }
            
            if (vector.group && vector.group.path) {
                const groupPaths = vector.group.path;
                const pathArray = Array.isArray(groupPaths) ? groupPaths : [groupPaths];
                paths += this.convertVectorPaths(pathArray);
            }
        } catch (error: any) {
            console.error('Error converting vector paths:', error);
            return `<svg><text x="10" y="20" fill="red">Error converting paths: ${error?.message || 'Unknown error'}</text></svg>`;
        }

        return `<svg xmlns="http://www.w3.org/2000/svg" 
                     width="100%" 
                     height="100%"
                     viewBox="0 0 ${viewportWidth} ${viewportHeight}"
                     preserveAspectRatio="xMidYMid meet">
                    ${paths}
                </svg>`;
    }

    private static convertVectorPaths(paths: any[]): string {
        return paths.map(path => {
            const pathData = path.pathData;
            const fillColor = path.fillColor || '#FFFFFF';
            return `<path d="${pathData}" fill="${fillColor}" />`;
        }).join('\n');
    }

    private static convertLayoutToHtml(rootType: string, rootProps: any): string {
        return `
            <div class="layout-root">
                ${this.renderLayoutElement(rootType, rootProps)}
            </div>
        `;
    }

    private static renderLayoutElement(type: string, props: any, depth = 0): string {
        const elementName = type.split('.').pop() || type;
        const id = props.id ? props.id.replace(/^@\+id\//, '') : '';
        const width = this.convertLayoutDimension(props.layout_width);
        const height = this.convertLayoutDimension(props.layout_height);
        const margin = this.getMarginStyle(props);
        const padding = this.getPaddingStyle(props);
        
        let style = `
            width: ${width};
            height: ${height};
            margin: ${margin};
            padding: ${padding};
            position: relative;
            background-color: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 4px;
        `;

        // Add flexbox properties for ConstraintLayout
        if (type.includes('ConstraintLayout')) {
            style += `
                display: flex;
                flex-direction: column;
            `;
        }

        let content = '';
        
        // Handle different view types
        if (type.includes('TextView')) {
            const text = props.text || '[Text]';
            content = `<div class="text-content">${text}</div>`;
        } else if (type.includes('Button') || type.includes('FloatingActionButton')) {
            const icon = props.src ? `[${props.src}]` : '';
            const text = props.contentDescription || props.text || icon || '[Button]';
            content = `<div class="button-content">${text}</div>`;
        } else if (type.includes('ImageView') || type.includes('PreviewView')) {
            const src = props.src ? `[${props.src}]` : '[Image]';
            content = `<div class="image-placeholder">${src}</div>`;
        }

        // Handle child elements
        if (props) {
            Object.entries(props).forEach(([key, value]) => {
                // Check if this is a view element (not a layout attribute)
                if (typeof value === 'object' && value !== null && 
                    !key.startsWith('layout_') && 
                    !key.startsWith('android:') && 
                    !key.startsWith('app:') && 
                    !key.startsWith('tools:')) {
                    content += this.renderLayoutElement(key, value, depth + 1);
                }
            });
        }

        const constraints = this.getConstraintStyles(props);
        style += constraints;

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

    private static getConstraintStyles(props: any): string {
        let style = '';
        
        // Position
        if (props.layout_constraintTop_toTopOf) {
            style += 'align-self: flex-start;';
        }
        if (props.layout_constraintBottom_toBottomOf) {
            style += 'align-self: flex-end;';
        }
        if (props.layout_constraintStart_toStartOf || props.layout_constraintLeft_toLeftOf) {
            style += 'margin-right: auto;';
        }
        if (props.layout_constraintEnd_toEndOf || props.layout_constraintRight_toRightOf) {
            style += 'margin-left: auto;';
        }
        if (props.layout_constraintCenterHorizontally) {
            style += 'align-self: center;';
        }
        if (props.layout_constraintCenterVertically) {
            style += 'margin: auto 0;';
        }

        return style;
    }

    private static convertLayoutDimension(value: any): string {
        if (!value) {
            return 'auto';
        }
        if (value === 'match_parent' || value === '-1') {
            return '100%';
        }
        if (value === 'wrap_content' || value === '-2') {
            return 'auto';
        }
        if (typeof value === 'string' && value.endsWith('dp')) {
            return `${parseInt(value)}px`;
        }
        if (typeof value === 'number') {
            return `${value}px`;
        }
        return value.toString();
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
                        font-family: Arial, sans-serif;
                        min-height: 100vh;
                    }
                    .layout-root {
                        position: relative;
                        width: 360px;
                        height: 640px;
                        margin: 0 auto;
                        background-color: #1e1e1e;
                        border: 2px solid #3d3d3d;
                        border-radius: 8px;
                        overflow: auto;
                        display: flex;
                        flex-direction: column;
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
                        background-color: rgba(0, 0, 0, 0.5);
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
                        padding: 8px;
                        background-color: rgba(255, 255, 255, 0.1);
                        border-radius: 4px;
                        margin-top: 24px;
                    }
                    .button-content {
                        padding: 8px 16px;
                        background-color: #4CAF50;
                        border-radius: 4px;
                        margin-top: 24px;
                        display: inline-block;
                    }
                    .image-placeholder {
                        width: 48px;
                        height: 48px;
                        background-color: rgba(255, 255, 255, 0.1);
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        border-radius: 4px;
                        margin-top: 24px;
                    }
                    .controls {
                        position: fixed;
                        bottom: 20px;
                        right: 20px;
                        display: flex;
                        gap: 10px;
                    }
                    .controls button {
                        background: #3d3d3d;
                        border: none;
                        color: white;
                        padding: 5px 10px;
                        border-radius: 4px;
                        cursor: pointer;
                    }
                    .controls button:hover {
                        background: #4d4d4d;
                    }
                </style>
            </head>
            <body>
                ${layoutContent}
                <div class="controls">
                    <button onclick="document.querySelector('.layout-root').style.transform = 'scale(' + Math.max(0.5, +document.querySelector('.layout-root').style.transform.replace(/[^\d.]/g, '') - 0.1 || 0.9) + ')'">-</button>
                    <button onclick="document.querySelector('.layout-root').style.transform = 'scale(' + Math.min(2, +document.querySelector('.layout-root').style.transform.replace(/[^\d.]/g, '') + 0.1 || 1.1) + ')'">+</button>
                </div>
            </body>
            </html>`;
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
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        height: 100vh;
                        margin: 0;
                        background-color: transparent;
                    }
                    .preview-container {
                        background-color: #2d2d2d;
                        padding: 20px;
                        border-radius: 8px;
                        box-shadow: 0 2px 8px rgba(0,0,0,0.15);
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        gap: 20px;
                    }
                    .svg-container {
                        width: 200px;
                        height: 200px;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                    }
                    svg {
                        width: 100%;
                        height: 100%;
                    }
                    .controls {
                        display: flex;
                        gap: 10px;
                        align-items: center;
                    }
                    .controls button {
                        background: #3d3d3d;
                        border: none;
                        color: white;
                        padding: 5px 10px;
                        border-radius: 4px;
                        cursor: pointer;
                    }
                    .controls button:hover {
                        background: #4d4d4d;
                    }
                    #size-display {
                        color: #ffffff;
                        font-family: Arial, sans-serif;
                        font-size: 12px;
                    }
                </style>
            </head>
            <body>
                <div class="preview-container">
                    <div class="svg-container">
                        ${svg}
                    </div>
                    <div class="controls">
                        <button onclick="adjustSize(-50)">-</button>
                        <span id="size-display">200px</span>
                        <button onclick="adjustSize(50)">+</button>
                    </div>
                </div>
                <script>
                    function adjustSize(delta) {
                        const container = document.querySelector('.svg-container');
                        const display = document.getElementById('size-display');
                        const currentSize = parseInt(container.style.width) || 200;
                        const newSize = Math.max(50, Math.min(500, currentSize + delta));
                        
                        container.style.width = newSize + 'px';
                        container.style.height = newSize + 'px';
                        display.textContent = newSize + 'px';
                    }

                    document.querySelector('.svg-container').style.width = '200px';
                    document.querySelector('.svg-container').style.height = '200px';
                </script>
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
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        height: 100vh;
                        margin: 0;
                        background-color: #2d2d2d;
                        color: #e74c3c;
                        font-family: Arial, sans-serif;
                        padding: 20px;
                        text-align: center;
                    }
                </style>
            </head>
            <body>
                <h3>${message}</h3>
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
