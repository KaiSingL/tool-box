# 🧰 Web Tools Hub

A collection of lightweight, open-source browser utilities. All tools run entirely in your browser—no server required and no data leaves your device.

## 🚀 Live Demo

Check out the live site here: **[https://toolbox.kaising.net/](https://toolbox.kaising.net/)**

## 🛠️ Available Tools

### Chrome Promo Cropper
Quickly crop and resize images for the Chrome Web Store. Supports Small Promo, Marquee, Screenshots, and Icons.
- **Features:**
  - Zoom-to-cursor functionality for precise cropping
  - Locked aspect ratio during zoom
  - Pre-set dimensions for all Chrome Web Store requirements:
    - Small Promo (440×280)
    - Marquee (1400×560)
    - Screenshot Large (1280×800)
    - Screenshot Small (640×400)
    - Icon (128×128)
  - Direct PNG download
- **Tech:** HTML5 Canvas, Vanilla JavaScript

### Icon Resizer
Resize icons to multiple standard sizes at once. Perfect for web and mobile development.
- **Features:**
  - Bulk resize to multiple dimensions
  - Common icon presets (16×16, 32×32, 64×64, 128×128, 256×256, 512×512)
  - Download as ZIP file
  - Drag & drop support
- **Tech:** HTML5 Canvas, Vanilla JavaScript, JSZip, FileSaver.js

### Markdown ⇄ Textile
Convert between Markdown and Redmine Textile markup in both directions with one click.
- **Features:**
  - Bidirectional conversion (Markdown → Textile, Textile → Markdown)
  - Redmine-specific syntax support
  - One-click copy output to clipboard
- **Tech:** Vanilla JavaScript

### QR Code Generator
Generate QR codes for various types. Supports WiFi networks, URLs, text, and more.
- **Features:**
  - Multiple QR code types: WiFi, URL, Text, Email, Phone, SMS
  - Optional logo overlay for WiFi QR codes
  - Download QR code as PNG
  - Works on all devices with QR scanner
- **Tech:** QRCode.js, Vanilla JavaScript

### SVG Icon Collection
Browse and copy ready-to-use SVG icons. Includes UI icons, symbols, and decorative elements.
- **Features:**
  - Curated collection of SVG icons
  - One-click copy to clipboard
  - Clean, minimal icon designs
  - Perfect for web projects
- **Tech:** Vanilla JavaScript

### String Formatter
Format word lists with quotes, delimiters, and line breaks.
- **Features:**
  - Add quotes and delimiters to lists
  - Control words per line
  - Include/exclude trailing delimiters
  - Ignore blank lines option
  - Copy formatted output to clipboard
- **Tech:** Vanilla JavaScript

### Frame Grabber
Extract frames from videos as PNG images. Upload a video and grab any frame instantly.
- **Features:**
  - Custom timeline scrubber with 0.1s step controls
  - Frame capture at exact playback position
  - Download captured frame as PNG
  - Drag & drop video support
  - View captured frames in grid
  - Bulk download all frames as ZIP
- **Tech:** HTML5 Video, Canvas, Vanilla JavaScript, JSZip, FileSaver.js

### Log Reader
View and search large log files directly in your browser. Handles files up to 10GB+.
- **Features:**
  - Streaming support for massive files (10GB+)
  - Web Worker-powered search for fast results
  - Syntax highlighting
  - Navigate to specific line numbers
  - Download by line range
  - Match navigation with keyboard shortcuts
- **Tech:** Vanilla JavaScript, Web Workers

### Token Speed Visualizer
Visualize how fast tokens appear at a given tokens-per-second rate. Adjust TPS and watch the stream.
- **Features:**
  - Adjustable tokens-per-second rate
  - Real-time token visualization streaming
  - Start/stop controls
- **Tech:** Vanilla JavaScript

### Gif Frame Grabber
Extract frames from animated GIFs as PNG images.
- **Features:**
  - Browse and select frames from GIF
  - Download individual frames
  - Bulk download all frames as ZIP
- **Tech:** HTML5 Canvas, Vanilla JavaScript, JSZip, FileSaver.js

### Unicode Symbols
Browse and copy Unicode symbols mapped to Lucide icon categories. Copy characters, codepoints, HTML entities, CSS and JS escapes.
- **Features:**
  - Category-based browsing (arrows, math, currency, shapes, etc.)
  - Copy character, codepoint, HTML entity, CSS escape, or JS escape
  - Search by character or category name
- **Tech:** Vanilla JavaScript

### PDF Annotation Fixer
Repair Chinese mojibake in PDF annotation text, rebuild on-page appearance, and paint text with an imported TTF/OTF font.
- **Features:**
  - Load multiple PDFs and preview original vs recovered annotation text
  - Encoding recovery for common CP1252 / UTF-8 mix-ups
  - Export fixed PDFs with visible annotation appearance
- **Tech:** Vanilla JavaScript, pdf-lib, FontFace API

### Replace PDF Page
Replace one page in a combined PDF with a page from another PDF.
- **Features:**
  - Choose source and target page numbers
  - Drag-and-drop PDF loading
  - Download a new file without overwriting originals
- **Tech:** Vanilla JavaScript, pdf-lib

## 🛠️ Tech Stack

This project is built with simplicity and performance in mind:

- **HTML5 & CSS3**: Semantic markup and modern styling
- **Vanilla JavaScript**: No frameworks, just fast, native DOM manipulation
- **Neo-Brutalist CSS**: Custom design system for a bold, distinctive aesthetic
- **GitHub Pages**: For static hosting and CI/CD

## 📦 Installation & Usage

Since these tools are client-side only, you don't need a complex backend to run them.

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/KaiSingL/toolbox.git
    ```

2.  **Navigate to the project folder:**
    ```bash
    cd toolbox
    ```

3.  **Install dependencies:**
    ```bash
    npm install -g pnpm
    pnpm install
    ```
    Requires Node.js >=26.

4.  **Run locally:**
    Because the tools use ES modules or strict CORS policies in some browsers, it is best to use a local server.
    ```bash
    pnpm dev
    ```
    This serves the site on `http://localhost:8000` and opens it in your browser.

5.  Open your browser to `http://localhost:8000`.

## 🤝 Contributing

Contributions are welcome! If you have a tool idea or a bug fix, feel free to open an issue or submit a pull request.

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingTool`)
3. Commit your Changes (`git commit -m 'Add some AmazingTool'`)
4. Push to the Branch (`git push origin feature/AmazingTool`)
5. Open a Pull Request

## 📄 License

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published
by the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program.  If not, see <https://www.gnu.org/licenses/>.

---

Made with ❤️ by [Kai Sing](https://kaising.net/)
