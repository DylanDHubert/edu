"use client";

import { useState, useEffect, Suspense } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "../../utils/supabase/client";
import StandardHeader from "../../components/StandardHeader";
import InviteModal from "../../components/InviteModal";
import ConfirmationModal from "../../components/ConfirmationModal";

interface courseMember {
  id: string;
  user_id: string;
  role: string;
  status: string;
  created_at: string;
  profiles?: {
    email: string;
    full_name?: string;
  };
  is_original_manager?: boolean;
}

interface PendingInvite {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
  created_at: string;
}



function EditMembersContent() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const courseId = searchParams.get('courseId');
  const supabase = createClient();

  const [course, setcourse] = useState<any>(null);
  const [existingMembers, setExistingMembers] = useState<courseMember[]>([]);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string>('');
  const [isOriginalManager, setIsOriginalManager] = useState<boolean>(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [confirmationModal, setConfirmationModal] = useState<{
    isOpen: boolean;
    type: 'remove' | 'cancel';
    data: { memberId?: string; memberEmail?: string; inviteId?: string; email?: string; role?: string };
  }>({
    isOpen: false,
    type: 'remove',
    data: {}
  });

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    } else if (!courseId) {
              router.push("/");
    } else if (user && courseId) {
      loadExistingData();
    }
  }, [user, loading, courseId, router]);

  const loadExistingData = async () => {
    try {
      // Use the secure course data API endpoint
      const response = await fetch(`/api/courses/${courseId}/data`);
      const result = await response.json();

      if (!response.ok) {
        setError(result.error || 'Failed to load course data');
        return;
      }

      if (!result.success) {
        setError('Failed to load course data');
        return;
      }

      // Check if user is a manager
      if (result.data.userRole !== 'manager') {
        setError('Manager access required');
        return;
      }

      setUserRole(result.data.userRole);
      setIsOriginalManager(result.data.isOriginalManager || false);
      setcourse(result.data.course);

      // DEBUG: LOG THE MEMBERS DATA TO SEE WHAT'S BEING RECEIVED
      console.log('DEBUG: Members data received:', JSON.stringify(result.data.members, null, 2));
      console.log('DEBUG: Members count received:', result.data.members?.length || 0);

      // MEMBERS DATA NOW COMES WITH USER EMAIL FROM API
      setExistingMembers(result.data.members || []);

      // Set pending invitations from the course data
      setPendingInvites(result.data.invitations || []);

    } catch (error) {
      console.error('Error loading existing data:', error);
      setError('Failed to load course data');
    }
  };

  const handleInviteSent = () => {
    // Reload data after invitation is sent
    loadExistingData();
    setSuccessMessage('Invitation sent successfully');
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  const removeMember = async (memberId: string, memberEmail: string) => {
    // First, get member info to show in confirmation
    const member = existingMembers.find(m => m.id === memberId);
    const role = member?.role || 'member';
    
    setConfirmationModal({
      isOpen: true,
      type: 'remove',
      data: { memberId, memberEmail, role }
    });
  };

  const handleRemoveMemberConfirm = async () => {
    const { memberId, memberEmail } = confirmationModal.data;
    
    try {
      // Call API route to remove member
      const response = await fetch('/api/courses/members/remove', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          memberId,
          courseId
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to remove course member');
        setConfirmationModal({ isOpen: false, type: 'remove', data: {} });
        return;
      }

      const result = await response.json();

      // Check if it's an original manager error
      if (result.error && result.error.includes('original course manager')) {
        setError(result.error);
        setConfirmationModal({ isOpen: false, type: 'remove', data: {} });
        return;
      }

      // Member was removed successfully
      setConfirmationModal({ isOpen: false, type: 'remove', data: {} });
      loadExistingData();
      setSuccessMessage('course member removed successfully');
      setTimeout(() => setSuccessMessage(null), 3000);

    } catch (error) {
      console.error('Error removing member:', error);
      setError('Failed to remove course member');
      setConfirmationModal({ isOpen: false, type: 'remove', data: {} });
    }
  };

  const cancelInvite = async (inviteId: string, email: string) => {
    setConfirmationModal({
      isOpen: true,
      type: 'cancel',
      data: { inviteId, email }
    });
  };

  const handleCancelInviteConfirm = async () => {
    const { inviteId } = confirmationModal.data;
    
    try {
      const { error } = await supabase
        .from('course_member_invitations')
        .update({ status: 'declined' })
        .eq('id', inviteId);

      if (error) {
        console.error('Error cancelling invite:', error);
        setError('Failed to cancel invitation');
        setConfirmationModal({ isOpen: false, type: 'cancel', data: {} });
        return;
      }

      // Refresh the data
      setConfirmationModal({ isOpen: false, type: 'cancel', data: {} });
      loadExistingData();
      setSuccessMessage('Invitation cancelled successfully');
      setTimeout(() => setSuccessMessage(null), 3000);

    } catch (error) {
      console.error('Error cancelling invite:', error);
      setError('Failed to cancel invitation');
      setConfirmationModal({ isOpen: false, type: 'cancel', data: {} });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-slate-100 mb-4">Loading...</h1>
          <p className="text-slate-400">Loading course members...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="text-center max-w-md">
          <h1 className="text-4xl font-bold text-red-400 mb-4">Error</h1>
          <p className="text-slate-400 mb-6">{error}</p>
          <button
            onClick={() => router.push(`/launcher/course?courseId=${courseId}`)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-md font-medium transition-colors"
          >
            ←
          </button>
        </div>
      </div>
    );
  }

  if (!user || !courseId || !course) {
    return null;
  }

  return (
    <div className="min-h-screen bg-slate-900">
      <StandardHeader
        courseName={course.name}
        courseLocation={course.location}
        userRole={userRole}
        isOriginalManager={isOriginalManager}
        backUrl={`/launcher/course?courseId=${courseId}`}
      />

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {error && (
          <div className="mb-6 p-4 bg-red-900/50 border border-red-700 rounded-md">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        {successMessage && (
          <div className="mb-6 p-4 bg-green-900/50 border border-green-700 rounded-md">
            <p className="text-green-400 text-sm">{successMessage}</p>
          </div>
        )}

        <div className="space-y-8">
          {/* Current Course Members */}
          <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
            <h3 className="text-lg font-semibold text-slate-100 mb-6">Current Course Members ({existingMembers.length})</h3>
            
            {existingMembers.length === 0 ? (
              <p className="text-slate-400 text-sm italic">No course members yet</p>
            ) : (
              <div className="space-y-3">
                {existingMembers.map((member) => (
                  <div key={member.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-slate-700 rounded border border-slate-600 space-y-3 sm:space-y-0">
                    <div className="flex items-center space-x-4">
                      <div className="w-10 h-10 bg-slate-600 rounded-full flex items-center justify-center flex-shrink-0">
                        <span className="text-slate-300 font-medium">
                          {member.user_id.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-slate-100 font-medium truncate">
                          Member {member.user_id.slice(0, 8)}
                        </div>
                        <div className="text-slate-400 text-sm truncate">
                          ID: {member.user_id.slice(0, 8)}...
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-3 flex-shrink-0">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        member.is_original_manager
                          ? 'bg-amber-900/50 text-amber-300 border border-amber-700'
                          : member.role === 'manager' 
                          ? 'bg-purple-900/50 text-purple-300 border border-purple-700' 
                          : 'bg-blue-900/50 text-blue-300 border border-blue-700'
                      }`}>
                        {member.is_original_manager 
                          ? 'Owner' 
                          : member.role.charAt(0).toUpperCase() + member.role.slice(1)
                        }
                      </span>
                      {member.user_id !== user.id && !member.is_original_manager && (
                        <button
                          onClick={() => removeMember(member.id, `Member ${member.user_id.slice(0, 8)}`)}
                          className="px-2 py-1 rounded text-xs font-medium bg-red-900/50 text-red-300 border border-red-700 hover:bg-red-800/50"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Pending Invitations */}
          {pendingInvites.length > 0 && (
            <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
              <h3 className="text-lg font-semibold text-slate-100 mb-6">Pending Invitations ({pendingInvites.length})</h3>
              
              <div className="space-y-3">
                {pendingInvites.map((invite) => (
                  <div key={invite.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-slate-700 rounded border border-slate-600 space-y-3 sm:space-y-0">
                    <div className="flex items-center space-x-4">
                      <div className="w-10 h-10 bg-slate-600 rounded-full flex items-center justify-center flex-shrink-0">
                        <span className="text-slate-300 font-medium">{invite.name.charAt(0).toUpperCase()}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-slate-100 font-medium truncate">{invite.name}</div>
                        <div className="text-slate-400 text-sm truncate">{invite.email}</div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-3 flex-shrink-0">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        invite.role === 'manager' 
                          ? 'bg-purple-900/50 text-purple-300 border border-purple-700' 
                          : 'bg-blue-900/50 text-blue-300 border border-blue-700'
                      }`}>
                        {invite.role.charAt(0).toUpperCase() + invite.role.slice(1)}
                      </span>
                      <span className="px-2 py-1 rounded text-xs font-medium bg-amber-900/50 text-amber-300 border border-amber-700">
                        Pending
                      </span>
                      <button
                        onClick={() => cancelInvite(invite.id, invite.email)}
                        className="px-2 py-1 rounded text-xs font-medium bg-red-900/50 text-red-300 border border-red-700 hover:bg-red-800/50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Add New Members */}
          <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
            <h3 className="text-lg font-semibold text-slate-100 mb-6">Invite New Members</h3>
            
            <div className="text-center py-8">
              <p className="text-slate-400 mb-6">
                Invite new members to join your course. They'll receive an in-app invitation that they can accept or decline.
              </p>
              
              <button
                onClick={() => setShowInviteModal(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-md font-medium transition-colors flex items-center gap-3 mx-auto"
              >
                <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                <span>Invite New Member</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Invitation Modal */}
      {showInviteModal && (
        <InviteModal
          isOpen={showInviteModal}
          onClose={() => setShowInviteModal(false)}
          courseId={courseId!}
          courseName={course.name}
          onInviteSent={handleInviteSent}
        />
      )}

      {/* Confirmation Modal */}
      <ConfirmationModal
        isOpen={confirmationModal.isOpen}
        onClose={() => setConfirmationModal({ isOpen: false, type: 'remove', data: {} })}
        onConfirm={confirmationModal.type === 'remove' ? handleRemoveMemberConfirm : handleCancelInviteConfirm}
        title={confirmationModal.type === 'remove' ? 'REMOVE course MEMBER' : 'CANCEL INVITATION'}
        message={
          confirmationModal.type === 'remove' 
            ? `Are you sure you want to remove ${confirmationModal.data.memberEmail?.includes('@unknown.com') ? 'this course member' : confirmationModal.data.memberEmail} (${confirmationModal.data.role}) from the course? This action cannot be undone.`
            : `Are you sure you want to cancel the invitation for ${confirmationModal.data.email}?`
        }
        confirmText={confirmationModal.type === 'remove' ? 'REMOVE MEMBER' : 'CANCEL INVITATION'}
        cancelText="CANCEL"
        variant="danger"
      />
    </div>
  );
}

export default function EditMembersPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <EditMembersContent />
    </Suspense>
  );
} 