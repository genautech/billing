import React from 'react';

interface MarkdownRendererProps {
    content: string;
    className?: string;
}

/**
 * Componente para renderizar conteúdo markdown de forma estilizada
 * Suporta: títulos, listas, negrito, itálico, parágrafos
 */
const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, className = '' }) => {
    if (!content) return null;

    const lines = content.split('\n');
    const elements: React.ReactNode[] = [];
    let currentList: string[] = [];
    let listType: 'ul' | 'ol' | null = null;
    let listCounter = 0; // Stable counter for list keys

    const flushList = () => {
        if (currentList.length > 0 && listType) {
            const ListComponent = listType === 'ul' ? 'ul' : 'ol';
            const listClass = listType === 'ul' 
                ? 'list-disc space-y-2 my-4 ml-6 text-gray-700' 
                : 'list-decimal space-y-2 my-4 ml-6 text-gray-700';
            const currentListKey = listCounter++;
            elements.push(
                <ListComponent key={`list-${currentListKey}`} className={listClass}>
                    {currentList.map((item, idx) => (
                        <li key={`item-${currentListKey}-${idx}`} className="leading-relaxed pl-2 mb-2">
                            {renderInlineMarkdown(item)}
                        </li>
                    ))}
                </ListComponent>
            );
            currentList = [];
            listType = null;
        }
    };

    lines.forEach((line, index) => {
        const trimmed = line.trim();

        // Linha vazia - criar separação entre parágrafos
        if (!trimmed) {
            flushList();
            // Adicionar espaçamento visual entre parágrafos
            if (index > 0 && index < lines.length - 1 && elements.length > 0) {
                // Não adicionar <br>, o espaçamento será feito pelo mb-4 dos parágrafos
            }
            return;
        }

        // Título H1 (## Título)
        if (trimmed.startsWith('## ')) {
            flushList();
            const titleText = renderInlineMarkdown(trimmed.substring(3));
            elements.push(
                <h2 key={`h2-${index}`} className="text-2xl font-bold text-gray-900 mt-8 mb-4 pb-3 border-b-2 border-gray-300 first:mt-0">
                    {titleText}
                </h2>
            );
            return;
        }

        // Título H2 (### Título)
        if (trimmed.startsWith('### ')) {
            flushList();
            const titleText = renderInlineMarkdown(trimmed.substring(4));
            elements.push(
                <h3 key={`h3-${index}`} className="text-xl font-semibold text-gray-800 mt-6 mb-3">
                    {titleText}
                </h3>
            );
            return;
        }

        // Título H3 (#### Título)
        if (trimmed.startsWith('#### ')) {
            flushList();
            const titleText = renderInlineMarkdown(trimmed.substring(5));
            elements.push(
                <h4 key={`h4-${index}`} className="text-lg font-semibold text-gray-800 mt-5 mb-2">
                    {titleText}
                </h4>
            );
            return;
        }

        // Lista não ordenada (- ou *)
        if (trimmed.match(/^[-*]\s+/)) {
            const item = trimmed.replace(/^[-*]\s+/, '');
            if (listType !== 'ul') {
                flushList();
                listType = 'ul';
            }
            currentList.push(item); // Armazenar como string, renderizar depois
            return;
        }

        // Lista ordenada (1. ou 1))
        if (trimmed.match(/^\d+[.)]\s+/)) {
            const item = trimmed.replace(/^\d+[.)]\s+/, '');
            if (listType !== 'ol') {
                flushList();
                listType = 'ol';
            }
            currentList.push(item); // Armazenar como string, renderizar depois
            return;
        }

        // Parágrafo normal
        flushList();
        const renderedLine = renderInlineMarkdown(trimmed);
        elements.push(
            <p key={`p-${index}`} className="text-gray-700 leading-relaxed mb-4 first:mt-0 text-base">
                {renderedLine}
            </p>
        );
    });

    flushList();

    return (
        <div className={`prose prose-sm max-w-none ${className}`}>
            <div className="text-gray-700 space-y-1">
                {elements.length > 0 ? elements : <p className="text-gray-600 italic">Conteúdo não disponível.</p>}
            </div>
        </div>
    );
};

/**
 * Renderiza markdown inline (negrito, itálico, código)
 */
const renderInlineMarkdown = (text: string): React.ReactNode => {
    const parts: React.ReactNode[] = [];
    let currentIndex = 0;
    let key = 0;

    // Regex para negrito (**texto** ou __texto__)
    const boldRegex = /(\*\*|__)(.+?)\1/g;
    // Regex para itálico (*texto* ou _texto_)
    const italicRegex = /(\*|_)(.+?)\1/g;
    // Regex para código inline (`código`)
    const codeRegex = /`(.+?)`/g;

    // Combinar todos os matches
    const allMatches: Array<{ start: number; end: number; type: 'bold' | 'italic' | 'code'; content: string }> = [];

    let match;
    
    // Negrito
    while ((match = boldRegex.exec(text)) !== null) {
        allMatches.push({
            start: match.index,
            end: match.index + match[0].length,
            type: 'bold',
            content: match[2]
        });
    }

    // Itálico (apenas se não for parte de negrito)
    while ((match = italicRegex.exec(text)) !== null) {
        const isPartOfBold = allMatches.some(m => 
            match.index >= m.start && match.index < m.end
        );
        if (!isPartOfBold) {
            allMatches.push({
                start: match.index,
                end: match.index + match[0].length,
                type: 'italic',
                content: match[2]
            });
        }
    }

    // Código
    while ((match = codeRegex.exec(text)) !== null) {
        allMatches.push({
            start: match.index,
            end: match.index + match[0].length,
            type: 'code',
            content: match[1]
        });
    }

    // Ordenar matches por posição
    allMatches.sort((a, b) => a.start - b.start);

    // Renderizar
    allMatches.forEach((match) => {
        // Texto antes do match
        if (match.start > currentIndex) {
            parts.push(text.substring(currentIndex, match.start));
        }

        // O match em si
        switch (match.type) {
            case 'bold':
                parts.push(<strong key={key++} className="font-semibold text-gray-900">{match.content}</strong>);
                break;
            case 'italic':
                parts.push(<em key={key++} className="italic text-gray-800">{match.content}</em>);
                break;
            case 'code':
                parts.push(<code key={key++} className="bg-gray-200 px-2 py-0.5 rounded text-sm font-mono text-gray-900 border border-gray-300">{match.content}</code>);
                break;
        }

        currentIndex = match.end;
    });

    // Texto restante
    if (currentIndex < text.length) {
        parts.push(text.substring(currentIndex));
    }

    return parts.length > 0 ? <>{parts}</> : text;
};

export default MarkdownRenderer;

