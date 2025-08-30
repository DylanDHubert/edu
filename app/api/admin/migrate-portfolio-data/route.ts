import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '../../../utils/supabase/server';
import { cookies } from 'next/headers';

export async function POST(request: NextRequest) {
  try {
    const { teamId } = await request.json();
    
    if (!teamId) {
      return NextResponse.json(
        { error: 'Team ID is required' },
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

    console.log('Starting migration for team:', teamId);

    // STEP 1: Get all accounts with existing account-level data
    const { data: accountsWithData, error: accountsError } = await supabase
      .from('team_accounts')
      .select(`
        id,
        team_id,
        account_portfolios (portfolio_id),
        team_knowledge!team_knowledge_account_id_fkey (
          id,
          category,
          title,
          content,
          metadata,
          created_by
        )
      `)
      .eq('team_id', teamId);

    if (accountsError) {
      console.error('Error loading accounts:', accountsError);
      return NextResponse.json(
        { error: 'Failed to load accounts for migration' },
        { status: 500 }
      );
    }

    let migratedCount = 0;
    let errors = [];

    // STEP 2: Process each account
    for (const account of accountsWithData || []) {
      try {
        const accountKnowledge = account.team_knowledge || [];
        const assignedPortfolios = account.account_portfolios || [];

        // Get account-level instruments and technical data
        const accountLevelData = accountKnowledge.filter((k: any) => 
          k.portfolio_id === null && 
          (k.category === 'instruments' || k.category === 'technical')
        );

        if (accountLevelData.length === 0 || assignedPortfolios.length === 0) {
          continue; // Skip if no data to migrate or no portfolios assigned
        }

        console.log(`Migrating data for account ${account.id} to ${assignedPortfolios.length} portfolios`);

        // STEP 3: Copy account-level data to each assigned portfolio
        for (const portfolioAssignment of assignedPortfolios) {
          const portfolioId = portfolioAssignment.portfolio_id;

          for (const knowledgeItem of accountLevelData) {
            // Check if this knowledge already exists for this portfolio
            const { data: existingKnowledge, error: checkError } = await supabase
              .from('team_knowledge')
              .select('id')
              .eq('team_id', teamId)
              .eq('account_id', account.id)
              .eq('portfolio_id', portfolioId)
              .eq('category', knowledgeItem.category)
              .eq('title', knowledgeItem.title)
              .single();

            if (existingKnowledge && !checkError) {
              console.log(`Knowledge item already exists for portfolio ${portfolioId}, skipping`);
              continue;
            }

            // Insert new portfolio-specific knowledge
            const { error: insertError } = await supabase
              .from('team_knowledge')
              .insert({
                team_id: teamId,
                account_id: account.id,
                portfolio_id: portfolioId,
                category: knowledgeItem.category,
                title: knowledgeItem.title,
                content: knowledgeItem.content,
                metadata: knowledgeItem.metadata,
                created_by: knowledgeItem.created_by || user.id
              });

            if (insertError) {
              console.error('Error inserting migrated knowledge:', insertError);
              errors.push(`Failed to migrate ${knowledgeItem.title} for portfolio ${portfolioId}: ${insertError.message}`);
            } else {
              migratedCount++;
            }
          }
        }

        // STEP 4: Remove old account-level instruments and technical data
        const { error: deleteError } = await supabase
          .from('team_knowledge')
          .delete()
          .eq('team_id', teamId)
          .eq('account_id', account.id)
          .is('portfolio_id', null)
          .in('category', ['instruments', 'technical']);

        if (deleteError) {
          console.error('Error deleting old account-level data:', deleteError);
          errors.push(`Failed to delete old data for account ${account.id}: ${deleteError.message}`);
        }

      } catch (error) {
        console.error('Error migrating account:', account.id, error);
        errors.push(`Failed to migrate account ${account.id}: ${error}`);
      }
    }

    console.log(`Migration completed. Migrated ${migratedCount} knowledge items.`);

    return NextResponse.json({
      success: true,
      message: `Successfully migrated ${migratedCount} knowledge items`,
      migratedCount,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error) {
    console.error('Error in migration:', error);
    return NextResponse.json(
      { error: 'Internal server error during migration' },
      { status: 500 }
    );
  }
}
