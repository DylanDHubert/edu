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

    // Delete existing general knowledge for this team
    await supabase
      .from('team_knowledge')
      .delete()
      .eq('team_id', teamId)
      .is('account_id', null)
      .is('portfolio_id', null);

    // Create doctor knowledge entries
    if (generalKnowledge.doctors && generalKnowledge.doctors.length > 0) {
      for (const doctor of generalKnowledge.doctors) {
        if (doctor.name && doctor.name.trim()) {
          const { error: doctorError } = await supabase
            .from('team_knowledge')
            .insert({
              team_id: teamId,
              account_id: null,
              portfolio_id: null,
              category: 'doctor_info',
              title: doctor.name.trim(),
              content: `${doctor.specialty?.trim() || ''} - ${doctor.notes?.trim() || ''}`,
              metadata: {
                name: doctor.name.trim(),
                specialty: doctor.specialty?.trim() || '',
                notes: doctor.notes?.trim() || ''
              }
            });

          if (doctorError) {
            console.error('Error creating doctor knowledge:', doctorError);
          }
        }
      }
    }

    // Create access & misc knowledge entry
    if (generalKnowledge.accessMisc && generalKnowledge.accessMisc.trim()) {
      const { error: accessError } = await supabase
        .from('team_knowledge')
        .insert({
          team_id: teamId,
          account_id: null,
          portfolio_id: null,
          category: 'access_misc',
          title: 'Access & Miscellaneous',
          content: generalKnowledge.accessMisc.trim(),
          metadata: {
            content: generalKnowledge.accessMisc.trim()
          }
        });

      if (accessError) {
        console.error('Error creating access knowledge:', accessError);
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