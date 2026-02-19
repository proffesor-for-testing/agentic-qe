#!/usr/bin/env python3
"""
Convert Markdown file to professionally styled HTML.
"""

import os
import markdown
from pathlib import Path


def convert_md_to_html(input_path: str, output_path: str) -> None:
    """
    Convert a markdown file to HTML with professional styling.

    Args:
        input_path: Path to input .md file
        output_path: Path to output .html file
    """
    # Read markdown file
    with open(input_path, 'r', encoding='utf-8') as f:
        md_content = f.read()

    # Convert markdown to HTML with extensions
    md = markdown.Markdown(extensions=['tables', 'fenced_code', 'nl2br'])
    body_html = md.convert(md_content)

    # HTML template with professional styling
    html_template = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Adidas Tech Stack Assessment</title>
    <style>
        :root {{
            --primary-dark: #1a1a2e;
            --secondary-dark: #16213e;
            --accent: #0f3460;
            --text-dark: #2d3436;
            --text-light: #636e72;
            --border-light: #dfe6e9;
            --background-code: #f8f9fa;
            --table-hover: #f1f3f5;
        }}

        * {{
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }}

        body {{
            font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: var(--text-dark);
            background-color: #ffffff;
            padding: 20px;
        }}

        .container {{
            max-width: 960px;
            margin: 0 auto;
            background: white;
            padding: 40px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
            border-radius: 8px;
        }}

        h1 {{
            color: var(--primary-dark);
            font-size: 2.5em;
            font-weight: 700;
            margin-bottom: 0.5em;
            padding-bottom: 0.3em;
            border-bottom: 3px solid var(--accent);
        }}

        h2 {{
            color: var(--secondary-dark);
            font-size: 2em;
            font-weight: 600;
            margin-top: 1.5em;
            margin-bottom: 0.8em;
            padding-bottom: 0.2em;
            border-bottom: 2px solid var(--border-light);
        }}

        h3 {{
            color: var(--accent);
            font-size: 1.5em;
            font-weight: 600;
            margin-top: 1.3em;
            margin-bottom: 0.6em;
        }}

        h4 {{
            color: var(--text-dark);
            font-size: 1.2em;
            font-weight: 600;
            margin-top: 1.2em;
            margin-bottom: 0.5em;
        }}

        h5, h6 {{
            color: var(--text-dark);
            font-size: 1em;
            font-weight: 600;
            margin-top: 1em;
            margin-bottom: 0.4em;
        }}

        p {{
            margin-bottom: 1em;
            color: var(--text-dark);
        }}

        ul, ol {{
            margin-bottom: 1em;
            margin-left: 2em;
        }}

        li {{
            margin-bottom: 0.5em;
        }}

        /* Table Styles */
        table {{
            width: 100%;
            border-collapse: collapse;
            margin: 1.5em 0;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
            border-radius: 6px;
            overflow: hidden;
        }}

        thead {{
            background-color: var(--primary-dark);
            color: white;
        }}

        th {{
            padding: 14px 16px;
            text-align: left;
            font-weight: 600;
            font-size: 0.95em;
            letter-spacing: 0.3px;
            text-transform: uppercase;
        }}

        td {{
            padding: 12px 16px;
            border-bottom: 1px solid var(--border-light);
        }}

        tbody tr {{
            background-color: white;
            transition: background-color 0.2s ease;
        }}

        tbody tr:nth-child(even) {{
            background-color: #f8f9fa;
        }}

        tbody tr:hover {{
            background-color: var(--table-hover);
        }}

        /* Code Styles */
        code {{
            background-color: var(--background-code);
            padding: 2px 6px;
            border-radius: 3px;
            font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', 'Consolas', 'source-code-pro', monospace;
            font-size: 0.9em;
            color: #c7254e;
        }}

        pre {{
            background-color: var(--background-code);
            padding: 16px;
            border-radius: 6px;
            overflow-x: auto;
            margin: 1.5em 0;
            border-left: 4px solid var(--accent);
        }}

        pre code {{
            background-color: transparent;
            padding: 0;
            color: var(--text-dark);
        }}

        /* Blockquote Styles */
        blockquote {{
            border-left: 4px solid var(--accent);
            padding-left: 1em;
            margin: 1.5em 0;
            color: var(--text-light);
            font-style: italic;
        }}

        /* Link Styles */
        a {{
            color: var(--accent);
            text-decoration: none;
            border-bottom: 1px solid transparent;
            transition: border-bottom-color 0.2s ease;
        }}

        a:hover {{
            border-bottom-color: var(--accent);
        }}

        /* Horizontal Rule */
        hr {{
            border: none;
            border-top: 2px solid var(--border-light);
            margin: 2em 0;
        }}

        /* Strong/Bold */
        strong {{
            font-weight: 600;
            color: var(--primary-dark);
        }}

        /* Emphasis/Italic */
        em {{
            font-style: italic;
            color: var(--text-light);
        }}

        /* Responsive Design */
        @media (max-width: 768px) {{
            body {{
                padding: 10px;
            }}

            .container {{
                padding: 20px;
            }}

            h1 {{
                font-size: 2em;
            }}

            h2 {{
                font-size: 1.6em;
            }}

            h3 {{
                font-size: 1.3em;
            }}

            table {{
                font-size: 0.9em;
            }}

            th, td {{
                padding: 8px 10px;
            }}
        }}

        /* Print Styles */
        @media print {{
            .container {{
                box-shadow: none;
                padding: 0;
            }}

            tbody tr:hover {{
                background-color: transparent;
            }}
        }}
    </style>
</head>
<body>
    <div class="container">
{body_html}
    </div>
</body>
</html>"""

    # Write HTML file
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(html_template)

    # Get file size
    file_size = os.path.getsize(output_path)
    file_size_kb = file_size / 1024

    print(f"✅ Conversion successful!")
    print(f"📄 Input:  {input_path}")
    print(f"📄 Output: {output_path}")
    print(f"📊 Size:   {file_size:,} bytes ({file_size_kb:.2f} KB)")


if __name__ == "__main__":
    input_file = "/workspaces/agentic-qe/Agentic QCSD/03 Reference Docs/Adidas Problems - Adidas Tech Stack Assessment.md"
    output_file = "/workspaces/agentic-qe/Agentic QCSD/03 Reference Docs/Adidas Problems - Adidas Tech Stack Assessment.html"

    convert_md_to_html(input_file, output_file)
