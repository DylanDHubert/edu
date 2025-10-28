"use client";

import { useState, useEffect, Suspense } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "../../utils/supabase/client";
import { BrainCog, FileText } from "lucide-react";
import StandardHeader from "../../components/StandardHeader";
import CustomRadioButton from "../../components/CustomRadioButton";
import LoadingScreen from "../../components/LoadingScreen";
import { PortfolioProcessingSummary } from "../../components/PortfolioProcessingSummary";

interface Portfolio {
  id: string;
  name: string;
  description: string;
  documentCount: number;
  documents: Array<{ original_name: string }>;
}


interface courseData {
  id: string;
  name: string;
  location: string;
}

function PortfolioSelectContent() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const courseId = searchParams.get('courseId');
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [course, setcourse] = useState<courseData | null>(null);
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [selectedPortfolio, setSelectedPortfolio] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string>('');
  const [isOriginalManager, setIsOriginalManager] = useState<boolean>(false);
  const [creatingAssistant, setCreatingAssistant] = useState(false);
  const [processingStatus, setProcessingStatus] = useState<{
    isComplete: boolean;
    totalJobs: number;
    completedJobs: number;
    pendingJobs: number;
    processingJobs: number;
    failedJobs: number;
  } | null>(null);
  const [checkingProcessing, setCheckingProcessing] = useState(false);

  useEffect(() => {
    if (!authLoading && user && courseId) {
      loadcourseData();
    } else if (!authLoading && !user) {
      router.push('/login');
    } else if (!authLoading && !courseId) {
      router.push('/');
    }
  }, [authLoading, user, courseId, router]);

  // CHECK PROCESSING STATUS WHEN PORTFOLIO CHANGES
  useEffect(() => {
    if (selectedPortfolio && courseId) {
      checkProcessingStatus();
    }
  }, [selectedPortfolio, courseId]);

  // NO POLLING - ONLY CHECK ON PORTFOLIO CHANGE

  const loadcourseData = async () => {
    try {
      setLoading(true);
      
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

      setUserRole(result.data.userRole);
      setIsOriginalManager(result.data.isOriginalManager || false);
      setcourse({
        id: result.data.course.id,
        name: result.data.course.name,
        location: result.data.course.location
      });

      // Transform portfolios data for the select interface
      const transformedPortfolios = (result.data.portfolios || []).map((portfolio: any) => ({
        id: portfolio.id,
        name: portfolio.name,
        description: portfolio.description || '',
        documentCount: portfolio.course_documents?.length || 0,
        documents: portfolio.course_documents || []
      }));

      setPortfolios(transformedPortfolios);

      // Auto-select first portfolio if only one
      if (transformedPortfolios.length === 1) {
        setSelectedPortfolio(transformedPortfolios[0].id);
      }

    } catch (error) {
      console.error('Error loading course data:', error);
      setError('Failed to load course data');
    } finally {
      setLoading(false);
    }
  };



  const handlePortfolioChange = (portfolioId: string) => {
    setSelectedPortfolio(portfolioId);
  };


  const checkProcessingStatus = async () => {
    if (!selectedPortfolio || !courseId) return;
    
    setCheckingProcessing(true);
    try {
      const response = await fetch(`/api/courses/portfolios/processing-status?courseId=${courseId}&portfolioId=${selectedPortfolio}`);
      const result = await response.json();
      
      if (response.ok && result.success) {
        setProcessingStatus(result);
      } else {
        console.error('Failed to check processing status:', result.error);
        setProcessingStatus(null);
      }
    } catch (error) {
      console.error('Error checking processing status:', error);
      setProcessingStatus(null);
    } finally {
      setCheckingProcessing(false);
    }
  };

  const handleStartChat = async () => {
    if (!selectedPortfolio) {
      setError('Please select a portfolio');
      return;
    }

    // CHECK PROCESSING STATUS FIRST
    await checkProcessingStatus();
    
    if (processingStatus && !processingStatus.isComplete && processingStatus.totalJobs > 0) {
      setError(`Documents still processing... ${processingStatus.completedJobs} of ${processingStatus.totalJobs} ready`);
      return;
    }

    setCreatingAssistant(true);
    setError(null);

    try {
      // Call API to create/get dynamic assistant for this course+portfolio combination
      const response = await fetch('/api/assistants/create-dynamic', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          courseId,
          portfolioId: selectedPortfolio
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create assistant');
      }

      const { assistantId, assistantName } = await response.json();

      // Get portfolio name
      const selectedPortfolioData = portfolios.find(p => p.id === selectedPortfolio);

      // Store assistant context and redirect to chat
      const activeAssistant = {
        assistantId,
        assistantName,
        courseId,
        portfolioId: selectedPortfolio,
        portfolioName: selectedPortfolioData?.name,
        courseName: course?.name,
        courseLocation: course?.location,
        userRole: userRole,
        isOriginalManager: isOriginalManager
      };
      
      localStorage.setItem('activeAssistant', JSON.stringify(activeAssistant));
      
      // Dispatch custom event to notify ChatContext of the change
      window.dispatchEvent(new CustomEvent('activeAssistantChanged'));
      
      // CLEAR CURRENT CHAT TO ENSURE FRESH START
      window.dispatchEvent(new CustomEvent('clearCurrentChat'));
      
      console.log('ACTIVE ASSISTANT SET:', activeAssistant);

      // Redirect to the main chat interface
      router.push('/chat');

    } catch (error) {
      console.error('Error creating assistant:', error);
      setError(error instanceof Error ? error.message : 'Failed to start chat');
    } finally {
      setCreatingAssistant(false);
    }
  };

  if (authLoading || loading) {
    return (
      <LoadingScreen 
        title="HHB Assistant" 
        subtitle="Loading portfolios..." 
      />
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

  if (!course || portfolios.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="text-center max-w-md">
          <h1 className="text-4xl font-bold text-slate-400 mb-4">No Portfolios Found</h1>
          <p className="text-slate-400 mb-6">
            This course doesn't have any material collections set up yet. Please contact your course instructor.
          </p>
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
        <div className="space-y-8">
          
          {/* Portfolio Selection */}
          <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
            <h2 className="text-xl font-semibold text-slate-100 mb-4">Select Portfolio</h2>
            <p className="text-slate-400 text-sm mb-6">
              Choose the topic area or subject you want to work with.
            </p>
            
            <div className="space-y-3">
              {portfolios.map((portfolio) => (
                <CustomRadioButton
                  key={portfolio.id}
                  name="portfolio"
                  value={portfolio.id}
                  checked={selectedPortfolio === portfolio.id}
                  onChange={handlePortfolioChange}
                  label={portfolio.name}
                  description={portfolio.description}
                />
              ))}
            </div>
          </div>


          {/* Error Display */}
          {error && (
            <div className="bg-red-900/50 border border-red-700 rounded-md p-4">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          {/* Processing Summary */}
          {selectedPortfolio && courseId && processingStatus && (
            <PortfolioProcessingSummary
              courseId={courseId}
              portfolioId={selectedPortfolio}
              summary={{
                total: processingStatus.totalJobs,
                completed: processingStatus.completedJobs,
                pending: processingStatus.pendingJobs,
                processing: processingStatus.processingJobs,
                failed: processingStatus.failedJobs,
                isComplete: processingStatus.isComplete
              }}
              onRefresh={checkProcessingStatus}
              className="mb-4"
            />
          )}

          {/* Start Chat Button */}
          <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
            {processingStatus && !processingStatus.isComplete && processingStatus.totalJobs > 0 ? (
              <div className="text-center">
                <div className="text-yellow-400 text-sm mb-2">
                  Documents still processing...
                </div>
                <div className="text-slate-300 text-xs mb-3">
                  {processingStatus.completedJobs} of {processingStatus.totalJobs} ready
                </div>
                <button
                  disabled={true}
                  className="w-full bg-slate-600 text-slate-400 px-4 py-3 rounded-md font-medium cursor-not-allowed flex items-center gap-3"
                >
                  <BrainCog className="w-5 h-5 flex-shrink-0" />
                  <span className="flex-1 text-center">
                    {checkingProcessing ? 'Checking...' : 'Waiting for documents...'}
                  </span>
                </button>
              </div>
            ) : (
              <button
                onClick={handleStartChat}
                disabled={!selectedPortfolio || creatingAssistant}
                className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800 disabled:cursor-not-allowed text-white px-4 py-3 rounded-md font-medium transition-colors flex items-center gap-3"
              >
                <BrainCog className="w-5 h-5 flex-shrink-0" />
                <span className="flex-1 text-center">
                  {creatingAssistant ? 'Updating Assistant Knowledge...' : 'Start Chat'}
                </span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PortfolioSelectPage() {
  return (
    <Suspense fallback={
      <LoadingScreen 
        title="HHB Assistant" 
        subtitle="Loading..." 
      />
    }>
      <PortfolioSelectContent />
    </Suspense>
  );
} 