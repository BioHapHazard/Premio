// Lightweight markdown renderer for AI chat messages (returns JSX).
import { Fragment } from 'react';

// Helper: Parse inline markdown markup to formatted elements
function renderInline(text) {
  if (!text) return '';

  // Match bold (**), italic (* or _), inline code (`), and links ([text](url))
  const inlineRegex = /(\*\*.*?\*\*|\*.*?\*|`.*?`|\[.*?\]\(.*?\)|_.*?_)/g;
  const parts = text.split(inlineRegex);

  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={index} style={{ fontWeight: 'bold', color: '#ffffff' }}>{part.slice(2, -2)}</strong>;
    }
    if ((part.startsWith('*') && part.endsWith('*')) || (part.startsWith('_') && part.endsWith('_'))) {
      return <em key={index} style={{ fontStyle: 'italic' }}>{part.slice(1, -1)}</em>;
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code key={index} style={{
          background: 'rgba(255, 255, 255, 0.1)',
          padding: '2px 6px',
          borderRadius: '4px',
          fontFamily: 'monospace',
          fontSize: '0.85rem'
        }}>
          {part.slice(1, -1)}
        </code>
      );
    }
    const linkMatch = part.match(/^\[(.*?)\]\((.*?)\)$/);
    if (linkMatch) {
      const url = (linkMatch[2] || '').trim();
      // Only render a clickable link for safe schemes — block javascript:/data:/etc.
      // so a malicious AI/markdown response can't inject a script URL. Otherwise
      // show the label as plain text.
      if (/^(https?:|mailto:)/i.test(url)) {
        return (
          <a
            key={index}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--color-primary)', textDecoration: 'underline' }}
          >
            {linkMatch[1]}
          </a>
        );
      }
      return <span key={index}>{linkMatch[1]}</span>;
    }
    return part;
  });
}

// Helper: Parse multiline markdown (code blocks, headers, bulleted & numbered lists, paragraphs)
export function renderMarkdown(text) {
  if (!text) return null;

  // 1. Separate code blocks from normal text blocks first
  const parts = [];
  let currentIndex = 0;
  const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
  let match;

  while ((match = codeBlockRegex.exec(text)) !== null) {
    const textBefore = text.substring(currentIndex, match.index);
    if (textBefore) {
      parts.push({ type: 'text', content: textBefore });
    }
    parts.push({
      type: 'code-block',
      language: match[1],
      content: match[2]
    });
    currentIndex = codeBlockRegex.lastIndex;
  }

  const textAfter = text.substring(currentIndex);
  if (textAfter) {
    parts.push({ type: 'text', content: textAfter });
  }

  return parts.map((part, index) => {
    if (part.type === 'code-block') {
      return (
        <pre key={index} style={{
          background: 'rgba(0, 0, 0, 0.3)',
          border: '1px solid var(--glass-border)',
          borderRadius: '6px',
          padding: '10px',
          overflowX: 'auto',
          margin: '8px 0',
          fontFamily: 'monospace',
          fontSize: '0.8rem'
        }}>
          <code>{part.content.trim()}</code>
        </pre>
      );
    }

    const lines = part.content.split('\n');
    const elements = [];
    let listItems = [];
    let inList = false;
    let inOrderedList = false;
    let orderedListItems = [];

    const flushList = (key) => {
      if (inList && listItems.length > 0) {
        elements.push(
          <ul key={`ul-${key}`} style={{ margin: '8px 0', paddingLeft: '20px', listStyleType: 'disc' }}>
            {listItems.map((item, idx) => <li key={idx} style={{ margin: '4px 0' }}>{renderInline(item)}</li>)}
          </ul>
        );
        listItems = [];
        inList = false;
      }
      if (inOrderedList && orderedListItems.length > 0) {
        elements.push(
          <ol key={`ol-${key}`} style={{ margin: '8px 0', paddingLeft: '20px', listStyleType: 'decimal' }}>
            {orderedListItems.map((item, idx) => <li key={idx} style={{ margin: '4px 0' }}>{renderInline(item)}</li>)}
          </ol>
        );
        orderedListItems = [];
        inOrderedList = false;
      }
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Header match
      const headerMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
      if (headerMatch) {
        flushList(i);
        const level = headerMatch[1].length;
        const content = headerMatch[2];
        const headingStyle = {
          margin: '12px 0 6px 0',
          fontWeight: 'bold',
          color: '#ffffff'
        };
        if (level === 1) headingStyle.fontSize = '1.3rem';
        else if (level === 2) headingStyle.fontSize = '1.15rem';
        else headingStyle.fontSize = '1rem';

        elements.push(
          <div key={`h-${i}`} style={headingStyle}>
            {renderInline(content)}
          </div>
        );
        continue;
      }

      // Unordered list item match
      const listMatch = line.match(/^(\s*)([-*+])\s+(.*)$/);
      if (listMatch) {
        if (inOrderedList) flushList(i);
        inList = true;
        listItems.push(listMatch[3]);
        continue;
      }

      // Ordered list item match
      const orderedListMatch = line.match(/^(\s*)(\d+)\.\s+(.*)$/);
      if (orderedListMatch) {
        if (inList) flushList(i);
        inOrderedList = true;
        orderedListItems.push(orderedListMatch[3]);
        continue;
      }

      // Empty line / paragraph break
      if (trimmed === '') {
        flushList(i);
        continue;
      }

      // Normal line
      flushList(i);
      elements.push(
        <p key={`p-${i}`} style={{ margin: '6px 0', lineHeight: '1.4' }}>
          {renderInline(line)}
        </p>
      );
    }

    flushList(lines.length);
    return <Fragment key={index}>{elements}</Fragment>;
  });
}
