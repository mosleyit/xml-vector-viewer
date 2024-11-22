export interface ViewAttributes {
    id?: string;
    width: number | 'match_parent' | 'wrap_content';
    height: number | 'match_parent' | 'wrap_content';
    margin?: number;
    padding?: number;
    background?: string;
    text?: string;
    textSize?: number;
    textColor?: string;
    src?: string;
    contentDescription?: string;
}

export interface ConstraintAttributes {
    startToStart?: string;
    startToEnd?: string;
    endToStart?: string;
    endToEnd?: string;
    topToTop?: string;
    topToBottom?: string;
    bottomToTop?: string;
    bottomToBottom?: string;
    horizontalBias?: number;
    verticalBias?: number;
}

export interface ViewMeasureSpec {
    size: number;
    mode: 'exactly' | 'at_most' | 'unspecified';
}

export class View {
    protected attributes: ViewAttributes;
    protected constraints: ConstraintAttributes;
    protected measuredWidth: number = 0;
    protected measuredHeight: number = 0;
    protected children: View[] = [];
    protected parent?: ViewGroup;

    constructor(attributes: ViewAttributes, constraints: ConstraintAttributes = {}) {
        this.attributes = attributes;
        this.constraints = constraints;
    }

    measure(widthMeasureSpec: ViewMeasureSpec, heightMeasureSpec: ViewMeasureSpec) {
        let width = this.resolveSize(this.attributes.width, widthMeasureSpec);
        let height = this.resolveSize(this.attributes.height, heightMeasureSpec);

        this.measuredWidth = width;
        this.measuredHeight = height;
    }

    protected resolveSize(size: number | 'match_parent' | 'wrap_content', measureSpec: ViewMeasureSpec): number {
        if (size === 'match_parent') {
            return measureSpec.size;
        }
        if (size === 'wrap_content') {
            return Math.min(this.getDesiredSize(), measureSpec.size);
        }
        return size;
    }

    protected getDesiredSize(): number {
        return 100; // Default size for basic views
    }

    getMeasuredWidth(): number {
        return this.measuredWidth;
    }

    getMeasuredHeight(): number {
        return this.measuredHeight;
    }

    layout(left: number, top: number, right: number, bottom: number) {
        // Base layout implementation
    }

    addChild(child: View) {
        this.children.push(child);
        child.parent = this as any;
    }

    toHtml(): string {
        const style = this.getBaseStyle();
        return `
            <div class="android-view" style="${style}">
                ${this.getContentHtml()}
                ${this.children.map(child => child.toHtml()).join('')}
            </div>
        `;
    }

    protected getBaseStyle(): string {
        return `
            position: absolute;
            width: ${this.measuredWidth}px;
            height: ${this.measuredHeight}px;
            margin: ${this.attributes.margin || 0}px;
            padding: ${this.attributes.padding || 0}px;
            background-color: ${this.attributes.background || 'transparent'};
        `;
    }

    protected getContentHtml(): string {
        return '';
    }
}

export class TextView extends View {
    protected getDesiredSize(): number {
        return this.attributes.text ? this.attributes.text.length * 10 : 100;
    }

    protected getContentHtml(): string {
        const style = `
            color: ${this.attributes.textColor || '#000000'};
            font-size: ${this.attributes.textSize || 14}px;
        `;
        return `<span style="${style}">${this.attributes.text || ''}</span>`;
    }
}

export class Button extends TextView {
    protected getContentHtml(): string {
        const style = `
            background-color: #4CAF50;
            color: white;
            padding: 8px 16px;
            border-radius: 4px;
            display: inline-block;
        `;
        return `<button style="${style}">${this.attributes.text || ''}</button>`;
    }
}

export class ImageView extends View {
    protected getContentHtml(): string {
        return `<div class="image-placeholder">[${this.attributes.contentDescription || 'Image'}]</div>`;
    }
}

export class ViewGroup extends View {
    protected children: View[] = [];

    measure(widthMeasureSpec: ViewMeasureSpec, heightMeasureSpec: ViewMeasureSpec) {
        this.measureChildren(widthMeasureSpec, heightMeasureSpec);
        super.measure(widthMeasureSpec, heightMeasureSpec);
    }

    protected measureChildren(widthMeasureSpec: ViewMeasureSpec, heightMeasureSpec: ViewMeasureSpec) {
        this.children.forEach(child => {
            child.measure(widthMeasureSpec, heightMeasureSpec);
        });
    }
}

export class ConstraintLayout extends ViewGroup {
    measure(widthMeasureSpec: ViewMeasureSpec, heightMeasureSpec: ViewMeasureSpec) {
        // First pass: measure all children
        this.children.forEach(child => {
            const childWidthSpec = this.getChildMeasureSpec(widthMeasureSpec, child);
            const childHeightSpec = this.getChildMeasureSpec(heightMeasureSpec, child);
            child.measure(childWidthSpec, childHeightSpec);
        });

        // Second pass: resolve constraints
        this.resolveConstraints();

        super.measure(widthMeasureSpec, heightMeasureSpec);
    }

    private getChildMeasureSpec(parentSpec: ViewMeasureSpec, child: View): ViewMeasureSpec {
        return {
            size: parentSpec.size,
            mode: parentSpec.mode
        };
    }

    private resolveConstraints() {
        // Implement constraint resolution logic here
    }

    protected getBaseStyle(): string {
        return `
            ${super.getBaseStyle()}
            position: relative;
        `;
    }
}
