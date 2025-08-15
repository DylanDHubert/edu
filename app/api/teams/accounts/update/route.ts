import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '../../../../utils/supabase/server';
import { cookies } from 'next/headers';
import OpenAI from 'openai';
import { createAccountPortfolioKnowledgeText } from '../../../../utils/knowledge-generator';

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    // Check if this is a multipart form (with images) or JSON (without images)
    const contentType = request.headers.get('content-type') || '';
    
    let teamId: string;
    let accounts: any[];
    let imageFiles: { [key: string]: File } = {};

    if (contentType.includes('multipart/form-data')) {
      // Handle form data with images
      const formData = await request.formData();
      teamId = formData.get('teamId') as string;
      accounts = JSON.parse(formData.get('accounts') as string);
      
      // Extract image files
      for (const [key, value] of formData.entries()) {
        if (key.startsWith('image_') && value instanceof File) {
          imageFiles[key] = value;
        }
      }
    } else {
      // Handle JSON data without images
      const jsonData = await request.json();
      teamId = jsonData.teamId;
      accounts = jsonData.accounts;
    }

    // Validate required fields
    if (!teamId || !accounts || !Array.isArray(accounts)) {
      return NextResponse.json(
        { error: 'Team ID and accounts array are required' },
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

    // Get team and portfolio info
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

    // Validate accounts
    for (const account of accounts) {
      if (!account.name || !account.name.trim()) {
        return NextResponse.json(
          { error: 'All accounts must have a name' },
          { status: 400 }
        );
      }
      if (!account.assignedPortfolios || account.assignedPortfolios.length === 0) {
        return NextResponse.json(
          { error: `Account "${account.name}" must have at least one assigned portfolio` },
          { status: 400 }
        );
      }
    }

    // Update accounts
    const updatedAccounts = [];

    for (const accountData of accounts) {
      if (accountData.id) {
        // Update existing account
        const { data: updatedAccount, error: accountError } = await supabase
          .from('team_accounts')
          .update({
            name: accountData.name.trim(),
            description: accountData.description?.trim() || null,
            updated_at: new Date().toISOString()
          })
          .eq('id', accountData.id)
          .eq('team_id', teamId)
          .select()
          .single();

        if (accountError) {
          console.error('Error updating account:', accountError);
          return NextResponse.json(
            { error: 'Failed to update account: ' + accountData.name },
            { status: 500 }
          );
        }

        updatedAccounts.push(updatedAccount);

        // Update portfolio assignments
        // First, remove existing assignments
        await supabase
          .from('account_portfolios')
          .delete()
          .eq('account_id', accountData.id);

        // Then add new assignments
        for (const portfolioId of accountData.assignedPortfolios) {
          const { error: assignmentError } = await supabase
            .from('account_portfolios')
            .insert({
              account_id: accountData.id,
              portfolio_id: portfolioId
            });

          if (assignmentError) {
            console.error('Error creating portfolio assignment:', assignmentError);
          }
        }

        // Update team knowledge for this account (for each assigned portfolio)
        for (const portfolioId of accountData.assignedPortfolios) {
          await updateAccountKnowledge(supabase, teamId, accountData, portfolioId, imageFiles);
        }

      } else {
        // Create new account (fallback for accounts without ID)
        const { data: createdAccount, error: accountError } = await supabase
          .from('team_accounts')
          .insert({
            team_id: teamId,
            name: accountData.name.trim(),
            description: accountData.description?.trim() || null,
            created_by: user.id
          })
          .select()
          .single();

        if (accountError) {
          console.error('Error creating account:', accountError);
          return NextResponse.json(
            { error: 'Failed to create account: ' + accountData.name },
            { status: 500 }
          );
        }

        updatedAccounts.push(createdAccount);

        // Create portfolio assignments for new account
        for (const portfolioId of accountData.assignedPortfolios) {
          const { error: assignmentError } = await supabase
            .from('account_portfolios')
            .insert({
              account_id: createdAccount.id,
              portfolio_id: portfolioId
            });

          if (assignmentError) {
            console.error('Error creating portfolio assignment:', assignmentError);
          }
        }

        // Create knowledge for new account (for each assigned portfolio)
        for (const portfolioId of accountData.assignedPortfolios) {
          await updateAccountKnowledge(supabase, teamId, { ...accountData, id: createdAccount.id }, portfolioId, imageFiles);
        }
      }
    }

    console.log('Account update completed successfully');
    return NextResponse.json({
      success: true,
      message: `Successfully updated ${updatedAccounts.length} account(s)`,
      accounts: updatedAccounts
    });

  } catch (error) {
    console.error('Error in account update:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

async function updateAccountKnowledge(supabase: any, teamId: string, accountData: any, portfolioId: string, imageFiles: any) {
  try {
    console.log(`Updating knowledge for account ${accountData.id}, portfolio ${portfolioId}`);
    console.log('Account data:', JSON.stringify(accountData, null, 2));
    
    // Handle inventory knowledge - UPDATE or INSERT each item
    if (accountData.inventory && accountData.inventory.length > 0) {
      for (const item of accountData.inventory) {
        if (item.name && item.name.trim()) {
          // Check if this inventory item already exists
          const { data: existingItem, error: checkError } = await supabase
            .from('team_knowledge')
            .select('id')
            .eq('team_id', teamId)
            .eq('account_id', accountData.id)
            .eq('portfolio_id', portfolioId)
            .eq('category', 'inventory')
            .eq('title', item.name.trim())
            .single();

          const knowledgeData = {
            title: item.name.trim(),
            content: `Quantity: ${item.quantity || 0}`,
            metadata: {
              name: item.name.trim(),
              quantity: item.quantity || 0
            },
            updated_at: new Date().toISOString()
          };

          if (existingItem && !checkError) {
            // UPDATE existing record
            await supabase
              .from('team_knowledge')
              .update(knowledgeData)
              .eq('id', existingItem.id);
          } else {
            // INSERT new record
            await supabase
              .from('team_knowledge')
              .insert({
                team_id: teamId,
                account_id: accountData.id,
                portfolio_id: portfolioId,
                category: 'inventory',
                ...knowledgeData
              });
          }
        }
      }
    }

    // Handle instruments knowledge - UPDATE or INSERT each item
    if (accountData.instruments && accountData.instruments.length > 0) {
      for (const instrument of accountData.instruments) {
        if (instrument.name && instrument.name.trim()) {
          let imageUrl = instrument.imageUrl;
          let imageName = instrument.imageName;

          // Handle new image upload
          if (instrument.hasNewImage && instrument.imageKey && imageFiles[instrument.imageKey]) {
            const imageFile = imageFiles[instrument.imageKey];
            const fileName = `team-${teamId}/instruments/${Date.now()}-${imageFile.name}`;
            
            // Upload to Supabase Storage
            const { data: uploadData, error: uploadError } = await supabase.storage
              .from('user_note_images')
              .upload(fileName, imageFile);

            if (!uploadError && uploadData) {
              const { data: { publicUrl } } = supabase.storage
                .from('user_note_images')
                .getPublicUrl(fileName);
              
              imageUrl = `/api/images/${fileName}`;
              imageName = imageFile.name;
            }
          }

          // Check if this instrument already exists
          const { data: existingInstrument, error: checkError } = await supabase
            .from('team_knowledge')
            .select('id')
            .eq('team_id', teamId)
            .eq('account_id', accountData.id)
            .eq('portfolio_id', portfolioId)
            .eq('category', 'instruments')
            .eq('title', instrument.name.trim())
            .single();

          const knowledgeData = {
            title: instrument.name.trim(),
            content: instrument.description?.trim() || '',
            metadata: {
              name: instrument.name.trim(),
              description: instrument.description?.trim() || '',
              image_url: imageUrl,
              image_name: imageName
            },
            updated_at: new Date().toISOString()
          };

          if (existingInstrument && !checkError) {
            // UPDATE existing record
            await supabase
              .from('team_knowledge')
              .update(knowledgeData)
              .eq('id', existingInstrument.id);
          } else {
            // INSERT new record
            await supabase
              .from('team_knowledge')
              .insert({
                team_id: teamId,
                account_id: accountData.id,
                portfolio_id: portfolioId,
                category: 'instruments',
                ...knowledgeData
              });
          }
        }
      }
    }

    // Handle technical knowledge - UPDATE or INSERT
    if (accountData.technicalInfo && accountData.technicalInfo.trim()) {
      // Check if technical info already exists
      const { data: existingTechnical, error: checkError } = await supabase
        .from('team_knowledge')
        .select('id')
        .eq('team_id', teamId)
        .eq('account_id', accountData.id)
        .eq('portfolio_id', portfolioId)
        .eq('category', 'technical')
        .eq('title', 'Technical Information')
        .single();

      const knowledgeData = {
        title: 'Technical Information',
        content: accountData.technicalInfo.trim(),
        metadata: {
          content: accountData.technicalInfo.trim()
        },
        updated_at: new Date().toISOString()
      };

      if (existingTechnical && !checkError) {
        // UPDATE existing record
        await supabase
          .from('team_knowledge')
          .update(knowledgeData)
          .eq('id', existingTechnical.id);
      } else {
        // INSERT new record
        await supabase
          .from('team_knowledge')
          .insert({
            team_id: teamId,
            account_id: accountData.id,
            portfolio_id: portfolioId,
            category: 'technical',
            ...knowledgeData
          });
      }
    }

    // Clean up any orphaned records for removed items
    // Get all current knowledge items for this account+portfolio
    const { data: allCurrentKnowledge } = await supabase
      .from('team_knowledge')
      .select('id, category, title')
      .eq('team_id', teamId)
      .eq('account_id', accountData.id)
      .eq('portfolio_id', portfolioId);

    if (allCurrentKnowledge) {
      // Build list of titles that should exist
      const shouldExist = new Set();
      
             // Add inventory items
       if (accountData.inventory) {
         accountData.inventory.forEach((item: any) => {
           if (item.name?.trim()) shouldExist.add(`inventory:${item.name.trim()}`);
         });
       }
       
       // Add instruments
       if (accountData.instruments) {
         accountData.instruments.forEach((instrument: any) => {
           if (instrument.name?.trim()) shouldExist.add(`instruments:${instrument.name.trim()}`);
         });
       }
      
      // Add technical info
      if (accountData.technicalInfo?.trim()) {
        shouldExist.add('technical:Technical Information');
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

  } catch (error) {
    console.error('Error updating account knowledge:', error);
  }
} 