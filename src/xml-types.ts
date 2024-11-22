export interface XMLAttributes {
    [key: string]: string | number | boolean;
}

export interface XMLNode {
    [key: string]: XMLNode[] | string | number | boolean | undefined;
    '@_android:width'?: string;
    '@_android:height'?: string;
    '@_android:viewportWidth'?: number;
    '@_android:viewportHeight'?: number;
    '@_android:alpha'?: number;
    '@_android:pathData'?: string;
    '@_android:fillColor'?: string;
    '@_android:fillAlpha'?: number;
    '@_android:strokeColor'?: string;
    '@_android:strokeWidth'?: number;
    '@_id'?: string;
    '@_layout_width'?: string;
    '@_layout_height'?: string;
    '@_layout_margin'?: string;
    '@_layout_marginLeft'?: string;
    '@_layout_marginRight'?: string;
    '@_layout_marginTop'?: string;
    '@_layout_marginBottom'?: string;
    '@_padding'?: string;
    '@_paddingLeft'?: string;
    '@_paddingRight'?: string;
    '@_paddingTop'?: string;
    '@_paddingBottom'?: string;
    '@_text'?: string;
    '@_textSize'?: string;
    '@_textColor'?: string;
    '@_background'?: string;
    '@_src'?: string;
    '@_contentDescription'?: string;
    '@_layout_constraintLeft_toLeftOf'?: string;
    '@_layout_constraintRight_toRightOf'?: string;
    '@_layout_constraintTop_toTopOf'?: string;
    '@_layout_constraintBottom_toBottomOf'?: string;
    '@_layout_constraintHorizontal_bias'?: number;
    '@_layout_constraintVertical_bias'?: number;
}

export interface ParsedXML {
    '?xml'?: {
        '@_version': number;
        '@_encoding': string;
    };
    vector?: VectorDrawable;
    [key: string]: any;
}

export interface VectorDrawable extends XMLNode {
    path?: VectorPath[];
}

export interface VectorPath extends XMLNode {
    // Path-specific attributes are handled by XMLNode
}

export interface LayoutElement extends XMLNode {
    // Layout-specific attributes are handled by XMLNode
}

export interface ViewPosition {
    left: number;
    top: number;
    right: number;
    bottom: number;
}

export interface ConstraintInfo {
    id: string;
    leftToLeft?: string;
    leftToRight?: string;
    rightToLeft?: string;
    rightToRight?: string;
    topToTop?: string;
    topToBottom?: string;
    bottomToTop?: string;
    bottomToBottom?: string;
    startToStart?: string;
    startToEnd?: string;
    endToStart?: string;
    endToEnd?: string;
    horizontalBias?: number;
    verticalBias?: number;
}

export interface ViewInfo {
    element: Element;
    constraints: ConstraintInfo;
}
