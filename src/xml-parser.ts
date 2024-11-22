import { XMLParser } from 'fast-xml-parser';
import { View, ViewGroup, TextView, Button, ImageView, ConstraintLayout, ViewAttributes, ConstraintAttributes } from './android-layout';

export interface ParsedView {
    type: string;
    attributes: { [key: string]: any };
    children: ParsedView[];
}

export class AndroidXMLParser {
    private static parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: '@_',
        removeNSPrefix: false,
        parseAttributeValue: true,
        trimValues: true
    });

    static parse(xmlString: string): ParsedView | null {
        const parsed = this.parser.parse(xmlString);
        console.log('Parsed XML:', JSON.stringify(parsed, null, 2));

        // Handle vector drawables
        if (parsed.vector) {
            return this.parseVectorDrawable(parsed.vector);
        }

        // Handle layouts
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
            return null;
        }

        const [type, props] = rootElement;
        return this.parseView(type, props);
    }

    private static parseVectorDrawable(vector: any): ParsedView {
        return {
            type: 'vector',
            attributes: {
                width: vector['@_android:width'],
                height: vector['@_android:height'],
                viewportWidth: vector['@_android:viewportWidth'],
                viewportHeight: vector['@_android:viewportHeight'],
                paths: vector.path ? (Array.isArray(vector.path) ? vector.path : [vector.path]) : []
            },
            children: []
        };
    }

    private static parseView(type: string, props: any): ParsedView {
        const attributes: { [key: string]: any } = {};
        const children: ParsedView[] = [];

        Object.entries(props).forEach(([key, value]) => {
            if (key.startsWith('@_')) {
                // Handle attributes
                const attrName = key.substring(2);
                if (Array.isArray(value)) {
                    attributes[attrName] = value[0];
                } else {
                    attributes[attrName] = value;
                }
            } else if (Array.isArray(value)) {
                // Handle child elements
                value.forEach((child: any) => {
                    children.push(this.parseView(key, child));
                });
            }
        });

        return {
            type,
            attributes,
            children
        };
    }

    static createView(parsedView: ParsedView): View {
        const viewAttrs = this.createViewAttributes(parsedView.attributes);
        const constraintAttrs = this.createConstraintAttributes(parsedView.attributes);

        let view: View;
        switch (parsedView.type.toLowerCase()) {
            case 'textview':
                view = new TextView(viewAttrs, constraintAttrs);
                break;
            case 'button':
            case 'floatingactionbutton':
                view = new Button(viewAttrs, constraintAttrs);
                break;
            case 'imageview':
            case 'previewview':
                view = new ImageView(viewAttrs, constraintAttrs);
                break;
            case 'constraintlayout':
                view = new ConstraintLayout(viewAttrs, constraintAttrs);
                break;
            default:
                view = new View(viewAttrs, constraintAttrs);
        }

        parsedView.children.forEach(child => {
            const childView = this.createView(child);
            if (view instanceof ViewGroup) {
                view.addChild(childView);
            }
        });

        return view;
    }

    private static createViewAttributes(attrs: any): ViewAttributes {
        return {
            id: attrs.id?.replace(/^@\+id\//, ''),
            width: this.parseDimension(attrs.layout_width),
            height: this.parseDimension(attrs.layout_height),
            margin: this.parsePixelValue(attrs.layout_margin),
            padding: this.parsePixelValue(attrs.padding),
            background: attrs.background,
            text: attrs.text,
            textSize: this.parsePixelValue(attrs.textSize),
            textColor: attrs.textColor,
            src: attrs.src,
            contentDescription: attrs.contentDescription
        };
    }

    private static createConstraintAttributes(attrs: any): ConstraintAttributes {
        return {
            startToStart: attrs.layout_constraintStart_toStartOf,
            startToEnd: attrs.layout_constraintStart_toEndOf,
            endToStart: attrs.layout_constraintEnd_toStartOf,
            endToEnd: attrs.layout_constraintEnd_toEndOf,
            topToTop: attrs.layout_constraintTop_toTopOf,
            topToBottom: attrs.layout_constraintTop_toBottomOf,
            bottomToTop: attrs.layout_constraintBottom_toTopOf,
            bottomToBottom: attrs.layout_constraintBottom_toBottomOf,
            horizontalBias: attrs.layout_constraintHorizontal_bias,
            verticalBias: attrs.layout_constraintVertical_bias
        };
    }

    private static parseDimension(value: any): number | 'match_parent' | 'wrap_content' {
        if (!value) return 'wrap_content';
        if (value === 'match_parent' || value === '-1') return 'match_parent';
        if (value === 'wrap_content' || value === '-2') return 'wrap_content';
        if (typeof value === 'string' && value.endsWith('dp')) {
            return parseInt(value);
        }
        return parseInt(value) || 'wrap_content';
    }

    private static parsePixelValue(value: any): number {
        if (!value) return 0;
        if (typeof value === 'string') {
            if (value.endsWith('dp') || value.endsWith('sp')) {
                return parseInt(value);
            }
        }
        return parseInt(value) || 0;
    }
}
