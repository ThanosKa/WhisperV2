'use client';

function formatDuration(totalSeconds: number) {
    if (!totalSeconds || totalSeconds <= 0) return '0h 00m';
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    return `${hours}h ${String(minutes).padStart(2, '0')}m`;
}

function SkeletonStatsCard() {
    return (
        <div className="bg-white rounded-lg p-8 border border-gray-200 animate-pulse">
            <div className="h-6 bg-gray-200 rounded w-1/2 mb-3" />
            <div className="h-10 bg-gray-100 rounded w-1/3" />
        </div>
    );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
    return (
        <div className="bg-white rounded-lg p-8 border border-gray-200">
            <div className="flex items-center gap-2 mb-2">
                <div className="text-lg text-gray-500">{label}</div>
            </div>
            <div className="text-3xl text-gray-900">{value}</div>
        </div>
    );
}

interface StatsCardsProps {
    isLoading: boolean;
    totalMeetingSeconds: number;
    totalQuestions: number;
}

export function StatsCards({ isLoading, totalMeetingSeconds, totalQuestions }: StatsCardsProps) {
    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-12">
            {isLoading ? (
                <>
                    <SkeletonStatsCard />
                    <SkeletonStatsCard />
                </>
            ) : (
                <>
                    <StatCard label="Total time in meetings" value={formatDuration(totalMeetingSeconds)} />
                    <StatCard label="Whisper Uses" value={totalQuestions} />
                </>
            )}
        </div>
    );
}
