import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '../../../../utils/supabase/server';
import { cookies } from 'next/headers';

export async function POST(request: NextRequest) {
  try {
    const { teamId, generalKnowledge } = await request.json();
    console.log('General knowledge update called for team:', teamId);
    console.log('General knowledge data:', JSON.stringify(generalKnowledge, null, 2));

    // Validate required fields
    if (!teamId || !generalKnowledge) {
      return NextResponse.json(
        { error: 'Team ID and general knowledge are required' },
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

    // Handle doctor knowledge - UPDATE or INSERT each doctor
    if (generalKnowledge.doctors && generalKnowledge.doctors.length > 0) {
      for (const doctor of generalKnowledge.doctors) {
        if (doctor.name && doctor.name.trim()) {
          // Check if this doctor already exists
          const { data: existingDoctor, error: checkError } = await supabase
            .from('team_knowledge')
            .select('id')
            .eq('team_id', teamId)
            .is('account_id', null)
            .is('portfolio_id', null)
            .eq('category', 'doctor_info')
            .eq('title', doctor.name.trim())
            .single();

          const knowledgeData = {
            title: doctor.name.trim(),
            content: `${doctor.specialty?.trim() || ''} - ${doctor.notes?.trim() || ''}`,
            metadata: {
              name: doctor.name.trim(),
              specialty: doctor.specialty?.trim() || '',
              notes: doctor.notes?.trim() || ''
            },
            updated_at: new Date().toISOString()
          };

          if (existingDoctor && !checkError) {
            // UPDATE existing record
            const { error: doctorError } = await supabase
              .from('team_knowledge')
              .update(knowledgeData)
              .eq('id', existingDoctor.id);

            if (doctorError) {
              console.error('Error updating doctor knowledge:', doctorError);
            }
          } else {
            // INSERT new record
            const { error: doctorError } = await supabase
              .from('team_knowledge')
              .insert({
                team_id: teamId,
                account_id: null,
                portfolio_id: null,
                category: 'doctor_info',
                ...knowledgeData
              });

            if (doctorError) {
              console.error('Error creating doctor knowledge:', doctorError);
            }
          }
        }
      }
    }

    // Handle access & misc knowledge - UPDATE or INSERT
    if (generalKnowledge.accessMisc && generalKnowledge.accessMisc.trim()) {
      // Check if access misc already exists
      const { data: existingAccess, error: checkError } = await supabase
        .from('team_knowledge')
        .select('id')
        .eq('team_id', teamId)
        .is('account_id', null)
        .is('portfolio_id', null)
        .eq('category', 'access_misc')
        .eq('title', 'Access & Miscellaneous')
        .single();

      const knowledgeData = {
        title: 'Access & Miscellaneous',
        content: generalKnowledge.accessMisc.trim(),
        metadata: {
          content: generalKnowledge.accessMisc.trim()
        },
        updated_at: new Date().toISOString()
      };

      if (existingAccess && !checkError) {
        // UPDATE existing record
        const { error: accessError } = await supabase
          .from('team_knowledge')
          .update(knowledgeData)
          .eq('id', existingAccess.id);

        if (accessError) {
          console.error('Error updating access knowledge:', accessError);
        }
      } else {
        // INSERT new record
        const { error: accessError } = await supabase
          .from('team_knowledge')
          .insert({
            team_id: teamId,
            account_id: null,
            portfolio_id: null,
            category: 'access_misc',
            ...knowledgeData
          });

        if (accessError) {
          console.error('Error creating access knowledge:', accessError);
        }
      }
    }

    // Clean up any orphaned general knowledge records for removed items
    const { data: allCurrentKnowledge } = await supabase
      .from('team_knowledge')
      .select('id, category, title')
      .eq('team_id', teamId)
      .is('account_id', null)
      .is('portfolio_id', null);

    if (allCurrentKnowledge) {
      // Build list of titles that should exist
      const shouldExist = new Set();
      
      // Add doctors
      if (generalKnowledge.doctors) {
        generalKnowledge.doctors.forEach((doctor: any) => {
          if (doctor.name?.trim()) shouldExist.add(`doctor_info:${doctor.name.trim()}`);
        });
      }
      
      // Add access misc
      if (generalKnowledge.accessMisc?.trim()) {
        shouldExist.add('access_misc:Access & Miscellaneous');
      }

      // Delete any records that shouldn't exist anymore
      for (const record of allCurrentKnowledge) {
        const key = `${record.category}:${record.title}`;
        if (!shouldExist.has(key)) {
          await supabase
            .from('team_knowledge')
            .delete()
            .eq('id', record.id);
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: 'General knowledge updated successfully'
    });

  } catch (error) {
    console.error('Error updating general knowledge:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 