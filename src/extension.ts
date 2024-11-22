import * as vscode from 'vscode';
import { XMLParser } from 'fast-xml-parser';
import { ParsedXML, XMLNode, VectorDrawable, LayoutElement, ViewInfo, ConstraintInfo } from './xml-types';

class AndroidXMLPreview {
    private static readonly viewType = 'xmlVectorViewer.preview';
    private static readonly CONTAINER_WIDTH = 360;
    private static readonly CONTAINER_HEIGHT = 640;

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
            
            const isVectorDrawable = xmlString.includes('android:viewportWidth') || xmlString.includes('android:pathData');
            
            const parser = new XMLParser({
                ignoreAttributes: false,
                attributeNamePrefix: '@_',
                removeNSPrefix: !isVectorDrawable,
                parseAttributeValue: true,
                trimValues: true,
                isArray: (name) => {
                    return !isVectorDrawable || ['path', 'group'].includes(name);
                }
            });
            
            const parsed = parser.parse(xmlString) as ParsedXML;
            console.log('Parsed XML:', JSON.stringify(parsed, null, 2));

            if (parsed.vector) {
                panel.webview.html = this.getVectorDrawableHtml(this.convertVectorToSVG(parsed.vector));
            } else {
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
                    throw new Error('No valid root element found');
                }

                const [rootType, rootProps] = rootElement as [string, LayoutElement[]];
                panel.webview.html = this.getLayoutPreviewHtml(this.convertLayoutToHtml(rootType, rootProps[0]));
            }
        } catch (error: any) {
            console.error('Error processing XML:', error);
            panel.webview.html = this.getErrorHtml(`Failed to process XML: ${error?.message || 'Unknown error'}`);
        }
    }

    private static convertVectorToSVG(vector: VectorDrawable): string {
        const width = this.getAttributeValue(vector, 'width', '24dp').replace('dp', '');
        const height = this.getAttributeValue(vector, 'height', '24dp').replace('dp', '');
        const viewportWidth = this.getAttributeValue(vector, 'viewportWidth', width);
        const viewportHeight = this.getAttributeValue(vector, 'viewportHeight', height);
        const alpha = this.getAttributeValue(vector, 'alpha', '1');

        let paths = '';
        if (vector.path) {
            const pathArray = Array.isArray(vector.path) ? vector.path : [vector.path];
            pathArray.forEach((path: XMLNode) => {
                const pathData = this.getAttributeValue(path, 'pathData', '');
                const fillColor = this.getAttributeValue(path, 'fillColor', '#000000');
                const fillAlpha = this.getAttributeValue(path, 'fillAlpha', alpha);
                paths += `<path d="${pathData}" fill="${fillColor}" fill-opacity="${fillAlpha}"/>`;
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

    private static getAttributeValue(element: XMLNode, name: string, defaultValue: string = ''): string {
        const attrName = `@_android:${name}`;
        const value = element[attrName];
        return value !== undefined ? value.toString() : defaultValue;
    }

    private static convertLayoutToHtml(type: string, props: LayoutElement): string {
        const viewMap = new Map<string, ViewInfo>();
        const layoutContent = this.renderLayoutElement(type, props, viewMap);

        return `
            <div class="layout-root">
                ${layoutContent}
            </div>
        `;
    }

    private static renderLayoutElement(type: string, props: LayoutElement, viewMap: Map<string, ViewInfo>): string {
        const elementName = type.split('.').pop() || type;
        
        const id = this.getAttributeValue(props, 'id', '')?.replace(/^@\+id\//, '');
        const width = this.convertLayoutDimension(this.getAttributeValue(props, 'layout_width'));
        const height = this.convertLayoutDimension(this.getAttributeValue(props, 'layout_height'));
        const margin = this.getMarginStyle(props);
        const padding = this.getPaddingStyle(props);

        // Collect constraints
        const constraints: ConstraintInfo = {
            id: id || '',
            leftToLeft: this.getAttributeValue(props, 'layout_constraintLeft_toLeftOf') || 
                       this.getAttributeValue(props, 'layout_constraintStart_toStartOf'),
            rightToRight: this.getAttributeValue(props, 'layout_constraintRight_toRightOf') || 
                         this.getAttributeValue(props, 'layout_constraintEnd_toEndOf'),
            topToTop: this.getAttributeValue(props, 'layout_constraintTop_toTopOf'),
            bottomToBottom: this.getAttributeValue(props, 'layout_constraintBottom_toBottomOf'),
            horizontalBias: parseFloat(this.getAttributeValue(props, 'layout_constraintHorizontal_bias', '0.5')),
            verticalBias: parseFloat(this.getAttributeValue(props, 'layout_constraintVertical_bias', '0.5'))
        };

        let style = this.calculateConstraintStyle(constraints, width, height, margin, padding);

        let content = '';
        
        // Handle different view types
        if (type.includes('TextView')) {
            const text = this.getAttributeValue(props, 'text', '[Text]');
            const textColor = this.getAttributeValue(props, 'textColor', '#FFFFFF');
            const textSize = this.getAttributeValue(props, 'textSize', '14sp').replace('sp', 'px');
            const background = this.getAttributeValue(props, 'background', 'transparent');
            content = `<div class="text-content" style="color: ${textColor}; font-size: ${textSize}; background: ${background};">${text}</div>`;
        } else if (type.includes('Button') || type.includes('FloatingActionButton')) {
            const icon = this.getAttributeValue(props, 'src') ? `[${this.getAttributeValue(props, 'src')}]` : '';
            const text = this.getAttributeValue(props, 'contentDescription') || 
                        this.getAttributeValue(props, 'text') || 
                        icon || '[Button]';
            content = `<div class="button-content">${text}</div>`;
        } else if (type.includes('ImageView') || type.includes('PreviewView')) {
            content = `<div class="image-placeholder">[Image]</div>`;
        }

        // Handle child elements
        Object.entries(props).forEach(([key, value]) => {
            if (Array.isArray(value) && typeof value[0] === 'object' && !key.startsWith('@_')) {
                content += this.renderLayoutElement(key, value[0] as LayoutElement, viewMap);
            }
        });

        const idAttr = id ? `id="${id}"` : '';
        const classes = ['layout-element'];
        if (type.includes('ConstraintLayout')) {
            classes.push('constraint-layout');
            style += 'position: relative;';
        }

        return `
            <div class="${classes.join(' ')}" style="${style}" ${idAttr}>
                <div class="element-info">
                    <span class="element-type">${elementName}</span>
                    ${id ? `<span class="element-id">#${id}</span>` : ''}
                </div>
                ${content}
            </div>
        `;
    }

    private static calculateConstraintStyle(constraints: ConstraintInfo, width: string, height: string, margin: string, padding: string): string {
        let style = `
            position: absolute;
            width: ${width};
            height: ${height};
            margin: ${margin};
            padding: ${padding};
            background-color: rgba(255, 255, 255, 0.1);
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 4px;
        `;

        const horizontalBias = constraints.horizontalBias ?? 0.5;
        const verticalBias = constraints.verticalBias ?? 0.5;

        if (constraints.leftToLeft === 'parent' && constraints.rightToRight === 'parent') {
            style += `
                left: ${horizontalBias * 100}%;
                transform: translateX(-50%);
            `;
        } else if (constraints.leftToLeft === 'parent') {
            style += 'left: 0;';
        } else if (constraints.rightToRight === 'parent') {
            style += 'right: 0;';
        }

        if (constraints.topToTop === 'parent' && constraints.bottomToBottom === 'parent') {
            style += `
                top: ${verticalBias * 100}%;
                transform: translateY(-50%);
            `;
        } else if (constraints.topToTop === 'parent') {
            style += 'top: 0;';
        } else if (constraints.bottomToBottom === 'parent') {
            style += 'bottom: 0;';
        }

        // Handle both horizontal and vertical centering
        if ((constraints.leftToLeft === 'parent' && constraints.rightToRight === 'parent') &&
            (constraints.topToTop === 'parent' && constraints.bottomToBottom === 'parent')) {
            style = style.replace(/transform:[^;]+;/g, '') + 'transform: translate(-50%, -50%);';
        }

        return style;
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

    private static getMarginStyle(props: XMLNode): string {
        const margin = this.getAttributeValue(props, 'layout_margin', '0');
        const marginLeft = this.getAttributeValue(props, 'layout_marginLeft') || 
                         this.getAttributeValue(props, 'layout_marginStart') || margin;
        const marginRight = this.getAttributeValue(props, 'layout_marginRight') || 
                          this.getAttributeValue(props, 'layout_marginEnd') || margin;
        const marginTop = this.getAttributeValue(props, 'layout_marginTop') || margin;
        const marginBottom = this.getAttributeValue(props, 'layout_marginBottom') || margin;

        return `${this.convertLayoutDimension(marginTop)} ${this.convertLayoutDimension(marginRight)} ${this.convertLayoutDimension(marginBottom)} ${this.convertLayoutDimension(marginLeft)}`;
    }

    private static getPaddingStyle(props: XMLNode): string {
        const padding = this.getAttributeValue(props, 'padding', '8px');
        const paddingLeft = this.getAttributeValue(props, 'paddingLeft') || 
                          this.getAttributeValue(props, 'paddingStart') || padding;
        const paddingRight = this.getAttributeValue(props, 'paddingRight') || 
                           this.getAttributeValue(props, 'paddingEnd') || padding;
        const paddingTop = this.getAttributeValue(props, 'paddingTop') || padding;
        const paddingBottom = this.getAttributeValue(props, 'paddingBottom') || padding;

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
                        font-family: system-ui;
                        min-height: 100vh;
                        display: flex;
                        justify-content: center;
                    }
                    .layout-root {
                        width: ${this.CONTAINER_WIDTH}px;
                        height: ${this.CONTAINER_HEIGHT}px;
                        background-color: #1e1e1e;
                        border: 2px solid #3d3d3d;
                        border-radius: 8px;
                        padding: 16px;
                        position: relative;
                        overflow: hidden;
                    }
                    .layout-element {
                        box-sizing: border-box;
                    }
                    .constraint-layout {
                        position: relative !important;
                        width: 100% !important;
                        height: 100% !important;
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
                        pointer-events: none;
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
                </style>
            </head>
            <body>
                ${layoutContent}
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
