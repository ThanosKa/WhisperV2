'use client';

import { useMemo } from 'react';
import { z } from 'zod';
import { type SessionDetails } from '@/lib/api';

const stringList = z.array(z.string());

interface BulletListProps {
    heading: string;
    items: string[];
    spaced: boolean;
}

function BulletList({ heading, items, spaced }: BulletListProps) {
    return (
        <div className={spaced ? 'mb-6' : undefined}>
            <h3 className="text-sm font-semibold text-slate-900 mb-3">{heading}</h3>
            <ul className="my-4 ml-6 list-disc space-y-2 text-slate-900">
                {items.map((item, index) => (
                    <li key={index} className="leading-6">
                        {item}
                    </li>
                ))}
            </ul>
        </div>
    );
}

/** Insights of a running session, merged across analysis rounds without repeats, newest first (like the desktop SummaryView). */
const flattenInsights = (insights: SessionDetails['insights']) => {
    if (!insights || insights.length === 0) return null;

    const actions = new Set<string>();
    const summaryBullets = new Set<string>();
    insights.forEach(insight => {
        insight.payload.actions?.forEach(action => actions.add(action));
        insight.payload.summary?.forEach(bullet => summaryBullets.add(bullet));
    });

    return {
        actions: Array.from(actions).reverse(),
        summary: Array.from(summaryBullets).reverse(),
    };
};

function FinishedSummary({ summary }: { summary: NonNullable<SessionDetails['summary']> }) {
    const keyPoints = summary.bullet_json ? stringList.parse(JSON.parse(summary.bullet_json)) : [];
    const actionItems = summary.action_json ? stringList.parse(JSON.parse(summary.action_json)) : [];

    return (
        <>
            <p className="leading-7 text-slate-900 mb-6">{summary.tldr}</p>
            {keyPoints.length > 0 && <BulletList heading="Key points" items={keyPoints} spaced />}
            {actionItems.length > 0 && <BulletList heading="Action items" items={actionItems} spaced={false} />}
        </>
    );
}

interface SessionSummaryProps {
    isActiveSession: boolean;
    insights: SessionDetails['insights'];
    summary: SessionDetails['summary'];
}

export function SessionSummary({ isActiveSession, insights, summary }: SessionSummaryProps) {
    const flattenedInsights = useMemo(() => (isActiveSession ? flattenInsights(insights) : null), [isActiveSession, insights]);

    return (
        <div className="border-t border-slate-200 pt-6">
            <h2 className="text-lg font-medium text-slate-900 mb-4">Summary</h2>

            {isActiveSession ? (
                flattenedInsights ? (
                    <>
                        {flattenedInsights.summary.length > 0 && <BulletList heading="Key points" items={flattenedInsights.summary} spaced />}
                        {flattenedInsights.actions.length > 0 && <BulletList heading="Action items" items={flattenedInsights.actions} spaced={false} />}
                    </>
                ) : (
                    <p className="text-slate-500 italic">Summary will appear here once the session is complete.</p>
                )
            ) : (
                summary && <FinishedSummary summary={summary} />
            )}
        </div>
    );
}
