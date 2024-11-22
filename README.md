# Android XML Previewer

A Visual Studio Code extension that provides live preview for Android XML files, including vector drawables and layout files.

## Features

### Vector Drawable Preview
- Live preview of Android Vector Drawable XML files
- Converts Android Vector Drawable format to SVG for visualization
- Interactive size controls
- Supports basic vector drawable elements including paths and groups

### Layout Preview
- Live preview of Android Layout XML files
- Visual representation of layout hierarchy
- Shows constraints and positioning
- Displays placeholders for common elements:
  - TextViews with content
  - Buttons and FloatingActionButtons
  - ImageViews
- Interactive zoom controls

## Usage

1. Open any Android XML file (vector drawable or layout)
2. Click the "Open Android XML Preview" button in the editor title bar, or:
   - Use the Command Palette (Ctrl+Shift+P) and search for "Open Android XML Preview"
   - Right-click in the editor and select "Open Android XML Preview"
3. The preview will show your XML rendered appropriately based on its type

## Requirements

- Visual Studio Code version 1.95.0 or higher

## Known Issues

- Complex vector drawable features like gradients are not yet supported
- Some advanced path operations may not render correctly
- Layout preview is approximate and may not match exact Android rendering
- Some layout attributes are not yet supported

## Release Notes

### 0.0.1

Initial release:
- Basic preview functionality for vector drawables
- Basic preview functionality for layout files
- Support for common Android UI elements
- Interactive size/zoom controls
