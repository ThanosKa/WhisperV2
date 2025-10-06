'use client';

import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/cjs/styles/prism';

type MarkdownProps = {
    content: string;
    className?: string;
};

export default function Markdown({ content, className }: MarkdownProps) {
    // Memoize the parsed content for streaming performance
    const memoizedContent = React.useMemo(() => content, [content]);

    return (
        <div className={`prose prose-gray max-w-none ${className || ''}`}>
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                    h1: ({ children }) => <h1 className="text-2xl font-bold text-gray-900 mt-6 mb-4 first:mt-0">{children}</h1>,
                    h2: ({ children }) => <h2 className="text-xl font-semibold text-gray-900 mt-5 mb-3">{children}</h2>,
                    h3: ({ children }) => <h3 className="text-lg font-semibold text-gray-900 mt-4 mb-2">{children}</h3>,
                    h4: ({ children }) => <h4 className="text-base font-semibold text-gray-900 mt-3 mb-2">{children}</h4>,
                    p: ({ children }) => <p className="text-gray-800 leading-7 mb-4 last:mb-0">{children}</p>,
                    a: ({ href, children }) => (
                        <a
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-700 underline transition-colors"
                        >
                            {children}
                        </a>
                    ),
                    ul: ({ children }) => <ul className="list-disc list-inside space-y-2 text-gray-800 mb-4 ml-4">{children}</ul>,
                    ol: ({ children }) => <ol className="list-decimal list-inside space-y-2 text-gray-800 mb-4 ml-4">{children}</ol>,
                    li: ({ children }) => <li className="leading-7">{children}</li>,
                    blockquote: ({ children }) => (
                        <blockquote className="border-l-4 border-blue-500 bg-blue-50 pl-4 pr-4 py-2 italic text-gray-700 my-4 rounded-r-md">
                            {children}
                        </blockquote>
                    ),
                    code: ({ className, children, ...props }) => {
                        const match = /language-(\w+)/.exec(className || '');
                        const isInline = !String(children).includes('\n');

                        if (isInline) {
                            return (
                                <code className="bg-gray-100 text-gray-900 rounded px-1.5 py-0.5 font-mono text-sm font-medium" {...props}>
                                    {children}
                                </code>
                            );
                        }

                        // Syntax highlighting for code blocks
                        if (match) {
                            return (
                                <div className="my-4">
                                    <SyntaxHighlighter
                                        style={oneDark as any}
                                        language={match[1]}
                                        PreTag="div"
                                        className="rounded-md !bg-gray-900 !text-gray-100"
                                        showLineNumbers={String(children).split('\n').length > 5}
                                    >
                                        {String(children).replace(/\n$/, '')}
                                    </SyntaxHighlighter>
                                </div>
                            );
                        }

                        // Plain code block without language specification
                        return (
                            <pre className="bg-gray-900 text-gray-100 rounded-md p-4 overflow-x-auto text-sm my-4">
                                <code className="font-mono" {...props}>
                                    {children}
                                </code>
                            </pre>
                        );
                    },
                    table: ({ children }) => (
                        <div className="overflow-x-auto mb-6 rounded-lg border border-gray-200">
                            <table className="min-w-full text-sm border-collapse">{children}</table>
                        </div>
                    ),
                    thead: ({ children }) => <thead className="bg-gray-50 border-b border-gray-200">{children}</thead>,
                    tbody: ({ children }) => <tbody className="divide-y divide-gray-200">{children}</tbody>,
                    th: ({ children }) => (
                        <th className="px-4 py-3 font-semibold text-gray-900 text-left border-r border-gray-200 last:border-r-0">{children}</th>
                    ),
                    td: ({ children }) => <td className="px-4 py-3 border-r border-gray-200 last:border-r-0 text-gray-800">{children}</td>,
                    hr: () => <hr className="my-8 border-gray-300" />,
                    strong: ({ children }) => <strong className="font-semibold text-gray-900">{children}</strong>,
                    em: ({ children }) => <em className="italic text-gray-700">{children}</em>,
                }}
            >
                {memoizedContent}
            </ReactMarkdown>
        </div>
    );
}
