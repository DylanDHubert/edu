import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '../../../../utils/supabase/server';
import { cookies } from 'next/headers';
import OpenAI from 'openai';
import { createGeneralKnowledgeText } from '../../../../utils/knowledge-generator';

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    const { teamId, knowledge } = await request.json();

    // Validate required fields
    if (!teamId || !knowledge) {
      return NextResponse.json(
        { error: 'Team ID and knowledge are required' },
        { status: 400 }
      );
    }

    // Verify user authentication
    const cookieStore = cookies();
    const supabase = await createClient(cookieStore);
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Verify user is a manager of this team
    const { data: teamMember, error: memberError } = await supabase
      .from('team_members')
      .select('role')
      .eq('team_id', teamId)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single();

    if (memberError || !teamMember || teamMember.role !== 'manager') {
      return NextResponse.json(
        { error: 'Manager access required' },
        { status: 403 }
      );
    }

    // Get team info
    const { data: team, error: teamError } = await supabase
      .from('teams')
      .select('name')
      .eq('id', teamId)
      .single();

    if (teamError || !team) {
      return NextResponse.json(
        { error: 'Team not found' },
        { status: 404 }
      );
    }

    // Store general knowledge items in database
    const savedKnowledge = [];

    // Store doctor information
    for (const item of knowledge.doctorInfo || []) {
      if (item.title?.trim() || item.content?.trim()) {
        const { data: savedItem, error: saveError } = await supabase
          .from('team_knowledge')
          .insert({
            team_id: teamId,
            account_id: null, // General knowledge is not account-specific
            portfolio_id: null, // General knowledge is not portfolio-specific
            category: 'doctor_info',
            title: item.title?.trim() || 'Doctor Information',
            content: item.content?.trim() || '',
            metadata: {
              name: item.title?.trim() || 'Doctor Information',
              specialty: '', // Onboarding doesn't capture specialty separately
              notes: item.content?.trim() || ''
            },
            created_by: user.id
          })
          .select()
          .single();

        if (saveError) {
          console.error('Error saving doctor info:', saveError);
        } else {
          savedKnowledge.push(savedItem);
        }
      }
    }

    // Store surgeon information
    for (const item of knowledge.surgeonInfo || []) {
      if (item.title?.trim() || item.content?.trim()) {
        const { data: savedItem, error: saveError } = await supabase
          .from('team_knowledge')
          .insert({
            team_id: teamId,
            account_id: null, // General knowledge is not account-specific
            portfolio_id: null, // General knowledge is not portfolio-specific
            category: 'surgeon_info',
            title: item.title?.trim() || 'Surgeon Information',
            content: item.content?.trim() || '',
            metadata: {
              name: item.title?.trim() || 'Surgeon Information',
              specialty: '', // Onboarding doesn't capture specialty separately
              procedure_focus: '', // Onboarding doesn't capture procedure focus separately
              notes: item.content?.trim() || ''
            },
            created_by: user.id
          })
          .select()
          .single();

        if (saveError) {
          console.error('Error saving surgeon info:', saveError);
        } else {
          savedKnowledge.push(savedItem);
        }
      }
    }

    // Store access & misc information
    for (const item of knowledge.accessMisc || []) {
      if (item.title?.trim() || item.content?.trim()) {
        const { data: savedItem, error: saveError } = await supabase
          .from('team_knowledge')
          .insert({
            team_id: teamId,
            account_id: null, // General knowledge is not account-specific
            portfolio_id: null, // General knowledge is not portfolio-specific
            category: 'access_misc',
            title: item.title?.trim() || 'Access Information',
            content: item.content?.trim() || '',
            created_by: user.id
          })
          .select()
          .single();

        if (saveError) {
          console.error('Error saving access info:', saveError);
        } else {
          savedKnowledge.push(savedItem);
        }
      }
    }

    // Generate general knowledge text for OpenAI
    const knowledgeText = createGeneralKnowledgeText({
      teamName: team.name,
      doctorInfo: knowledge.doctorInfo || [],
      surgeonInfo: knowledge.surgeonInfo || [],
      accessMisc: knowledge.accessMisc || []
    });

    try {
      // Create text file for OpenAI
      const textFile = new File([knowledgeText], `${team.name.replace(/\s+/g, '_')}_general_knowledge.txt`, {
        type: 'text/plain'
      });

      // Upload to OpenAI
      const openaiFile = await client.files.create({
        file: textFile,
        purpose: 'assistants'
      });

      // Create Stage 3 vector store for general team knowledge
      const vectorStoreName = `${team.name} - General Team Knowledge`;
      
      const vectorStore = await (client as any).vectorStores.create({
        name: vectorStoreName
      });

      // Add file to vector store
      await (client as any).vectorStores.fileBatches.createAndPoll(
        vectorStore.id,
        { file_ids: [openaiFile.id] }
      );

      // Save general vector store record in teams table
      const { error: updateError } = await supabase
        .from('teams')
        .update({
          general_vector_store_id: vectorStore.id,
          general_vector_store_name: vectorStoreName
        })
        .eq('id', teamId);

      if (updateError) {
        console.error('Error updating team with general vector store:', updateError);
      }

      return NextResponse.json({
        success: true,
        savedKnowledge,
        generalVectorStore: {
          id: vectorStore.id,
          name: vectorStoreName
        },
        message: `General knowledge saved successfully with ${savedKnowledge.length} items.`
      });

    } catch (openaiError) {
      console.error('Error creating general knowledge vector store:', openaiError);
      
      // Still return success for database saves, but note the OpenAI error
      return NextResponse.json({
        success: true,
        savedKnowledge,
        openaiError: 'Failed to create vector store, but knowledge was saved to database',
        message: `General knowledge saved successfully with ${savedKnowledge.length} items.`
      });
    }

  } catch (error) {
    console.error('Error in general knowledge creation:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 