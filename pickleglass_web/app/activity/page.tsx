'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRedirectIfNotAuth } from '@/utils/auth'
import {
  UserProfile,
  Session,
  getSessions,
  getMeetings,
  getQuestions,
  deleteSession,
} from '@/utils/api'

export default function ActivityPage() {
  const userInfo = useRedirectIfNotAuth() as UserProfile | null;
  const [sessions, setSessions] = useState<Session[]>([])
  const [meetings, setMeetings] = useState<Session[]>([])
  const [questions, setQuestions] = useState<Session[]>([])
  const [activeTab, setActiveTab] = useState<'meetings' | 'questions'>('meetings')
  const [isLoading, setIsLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [totalMeetingSeconds, setTotalMeetingSeconds] = useState<number>(0)
  const [totalQuestions, setTotalQuestions] = useState<number>(0)

  const fetchSessions = async () => {
    try {
      const [fetchedMeetings, fetchedQuestions] = await Promise.all([
        getMeetings(),
        getQuestions(),
      ]);
      setMeetings(fetchedMeetings);
      setQuestions(fetchedQuestions);
      setSessions([...fetchedMeetings, ...fetchedQuestions]); // Keep for backward compatibility
    } catch (error) {
      console.error('Failed to fetch conversations:', error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchSessions()
    // Fetch stats in background (non-blocking)
    import('@/utils/api').then(async ({ getConversationStats }) => {
      try {
        const stats = await getConversationStats();
        setTotalMeetingSeconds(stats.totalMeetingSeconds || 0);
        setTotalQuestions(stats.totalQuestions || 0);
      } catch (e) {
        console.warn('Failed to fetch conversation stats')
      }
    })
  }, [])

  if (!userInfo) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  const getGreeting = () => {
    const hour = new Date().getHours()
    if (hour < 12) return 'Good morning'
    if (hour < 18) return 'Good afternoon'
    return 'Good evening'
  }

  const handleDelete = async (sessionId: string) => {
    if (!window.confirm('Are you sure you want to delete this activity? This cannot be undone.')) return;
    setDeletingId(sessionId);
    try {
      await deleteSession(sessionId);
      // Remove from both state arrays
      setMeetings(meetings => meetings.filter(s => s.id !== sessionId));
      setQuestions(questions => questions.filter(s => s.id !== sessionId));
      setSessions(sessions => sessions.filter(s => s.id !== sessionId));
    } catch (error) {
      alert('Failed to delete activity.');
      console.error(error);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-8 py-12">
        <div className="text-center mb-12">
          <h1 className="text-2xl text-gray-600">
            {getGreeting()}, {userInfo.display_name}
          </h1>
        </div>
        {/* Quick stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10">
          <div className="bg-white rounded-lg p-5 border border-gray-200">
            <div className="text-sm text-gray-500 mb-1">Total time in meetings</div>
            <div className="text-2xl font-semibold text-gray-900">{formatDuration(totalMeetingSeconds)}</div>
          </div>
          <div className="bg-white rounded-lg p-5 border border-gray-200">
            <div className="text-sm text-gray-500 mb-1">Total questions</div>
            <div className="text-2xl font-semibold text-gray-900">{totalQuestions}</div>
          </div>
        </div>
        <div>
          <h2 className="text-2xl font-semibold text-gray-900 mb-8 text-center">
            Your Past Activity
          </h2>
          
          {/* Tab Navigation */}
          <div className="flex justify-center mb-8">
            <div className="bg-gray-100 p-1 rounded-lg">
              <button
                onClick={() => setActiveTab('meetings')}
                className={`px-6 py-2 rounded-md font-medium transition-colors ${
                  activeTab === 'meetings'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Meetings ({meetings.length})
              </button>
              <button
                onClick={() => setActiveTab('questions')}
                className={`px-6 py-2 rounded-md font-medium transition-colors ${
                  activeTab === 'questions'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Questions ({questions.length})
              </button>
            </div>
          </div>
          
          {isLoading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-600 mx-auto"></div>
              <p className="mt-4 text-gray-600">Loading conversations...</p>
            </div>
          ) : (
            <div>
              {activeTab === 'meetings' ? (
                meetings.length > 0 ? (
                  <div className="space-y-4">
                    {meetings.map((session) => (
                      <SessionCard key={session.id} session={session} onDelete={handleDelete} deletingId={deletingId} />
                    ))}
                  </div>
                ) : (
                  <EmptyState type="meetings" />
                )
              ) : (
                questions.length > 0 ? (
                  <div className="space-y-4">
                    {questions.map((session) => (
                      <SessionCard key={session.id} session={session} onDelete={handleDelete} deletingId={deletingId} />
                    ))}
                  </div>
                ) : (
                  <EmptyState type="questions" />
                )
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// Helper components
function SessionCard({ session, onDelete, deletingId }: { 
  session: Session, 
  onDelete: (id: string) => void, 
  deletingId: string | null 
}) {
  const typeLabel = session.session_type === 'listen' ? 'Meeting' : 'Question';
  const typeColor = session.session_type === 'listen' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800';
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(session.title || '');
  const [saving, setSaving] = useState(false);
  
  const save = async () => {
    const t = (title || '').trim();
    if (!t || saving) return;
    setSaving(true);
    try {
      const { updateSessionTitle } = await import('@/utils/api');
      await updateSessionTitle(session.id, t);
      setIsEditing(false);
    } catch (e) {
      alert('Failed to save');
      console.error(e);
    } finally {
      setSaving(false);
    }
  }
  
  return (
    <div className="block bg-white rounded-lg p-6 shadow-sm border border-gray-200 hover:shadow-md transition-shadow cursor-pointer">
      <div className="flex justify-between items-start mb-3">
        <div className="min-w-0 flex-1">
          {isEditing ? (
            <div className="flex items-center gap-2">
              <input className="border rounded px-2 py-1 text-sm w-full" value={title} onChange={e => setTitle(e.target.value)} placeholder="Title" />
              <button onClick={save} className="px-2 py-1 rounded text-xs bg-blue-600 text-white" disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
              <button onClick={() => { setIsEditing(false); setTitle(session.title || ''); }} className="px-2 py-1 rounded text-xs border">Cancel</button>
            </div>
          ) : (
            <Link href={`/activity/details?sessionId=${session.id}`} className="text-lg font-medium text-gray-900 hover:underline truncate block">
              {session.title || `${typeLabel} - ${new Date(session.started_at * 1000).toLocaleDateString()}`}
            </Link>
          )}
          <div className="text-sm text-gray-500">
            {new Date(session.started_at * 1000).toLocaleString()}
          </div>
        </div>
        <div className="flex items-center gap-2 ml-4 shrink-0">
          <button
            onClick={() => setIsEditing(true)}
            className="px-3 py-1 rounded text-xs font-medium border hover:bg-gray-50"
          >
            Edit
          </button>
          <button
            onClick={() => onDelete(session.id)}
            disabled={deletingId === session.id}
            className={`px-3 py-1 rounded text-xs font-medium border border-red-200 text-red-700 bg-red-50 hover:bg-red-100 transition-colors ${deletingId === session.id ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {deletingId === session.id ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>
      <span className={`capitalize inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${typeColor}`}>
        {typeLabel}
      </span>
    </div>
  )
}

function EmptyState({ type }: { type: 'meetings' | 'questions' }) {
  const content = type === 'meetings' 
    ? {
        title: 'No meetings yet',
        description: 'Start a meeting in the desktop app using the Listen feature to see your meeting transcripts and summaries here.',
        tip: '💡 Tip: Click the Listen button in the desktop app during a meeting to automatically capture and summarize conversations.'
      }
    : {
        title: 'No questions yet', 
        description: 'Ask questions in the desktop app to see your Q&A history here.',
        tip: '💡 Tip: Use the Ask feature in the desktop app to get AI-powered answers to your questions.'
      };
      
  return (
    <div className="text-center bg-white rounded-lg p-12">
      <p className="text-gray-500 mb-4">{content.description}</p>
      <div className="text-sm text-gray-400">{content.tip}</div>
    </div>
  )
}

// utils
function formatDuration(totalSeconds: number) {
  if (!totalSeconds || totalSeconds <= 0) return '0h 00m';
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  return `${hours}h ${String(minutes).padStart(2, '0')}m`;
}
