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

    const { data: portfolios, error: portfoliosError } = await supabase
      .from('team_portfolios')
      .select('id, name')
      .eq('team_id', teamId);

    if (portfoliosError) {
      return NextResponse.json(
        { error: 'Failed to load portfolios' },
        { status: 500 }
      );
    }

    const portfolioMap: Record<string, string> = portfolios?.reduce((acc, p) => ({ ...acc, [p.id]: p.name }), {} as Record<string, string>) || {};

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

    // Create accounts and generate vector stores
    const createdAccounts = [];
    const accountPortfolioStores = [];

    for (const accountData of accounts) {
      // Create account record
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

      createdAccounts.push(createdAccount);

      // Create account-portfolio assignments and vector stores
      for (const portfolioId of accountData.assignedPortfolios) {
        // Create account-portfolio assignment
        const { error: assignmentError } = await supabase
          .from('account_portfolios')
          .insert({
            account_id: createdAccount.id,
            portfolio_id: portfolioId
          });

        if (assignmentError) {
          console.error('Error creating portfolio assignment:', assignmentError);
          continue;
        }

        // Generate knowledge text for this account-portfolio combination
        const knowledgeData = accountData.knowledge[portfolioId] || {
          inventory: [],
          instruments: [],
          technical: []
        };

        const knowledgeText = createAccountPortfolioKnowledgeText({
          teamName: team.name,
          accountName: createdAccount.name,
          portfolioName: portfolioMap[portfolioId] || 'Unknown Portfolio',
          knowledge: knowledgeData
        });

        try {
          // Create text file for OpenAI
          const textFile = new File([knowledgeText], `${createdAccount.name}-${portfolioMap[portfolioId]}-knowledge.txt`, {
            type: 'text/plain'
          });

          // Upload to OpenAI
          const openaiFile = await client.files.create({
            file: textFile,
            purpose: 'assistants'
          });

          // Create vector store for this account-portfolio combination
          const vectorStoreName = `${createdAccount.name} - ${portfolioMap[portfolioId]} Knowledge`;
          
          const vectorStore = await (client as any).vectorStores.create({
            name: vectorStoreName
          });

          // Add file to vector store
          await (client as any).vectorStores.fileBatches.createAndPoll(
            vectorStore.id,
            { file_ids: [openaiFile.id] }
          );

          // Save account-portfolio vector store record
          const { data: storeRecord, error: storeError } = await supabase
            .from('account_portfolio_stores')
            .insert({
              team_id: teamId,
              account_id: createdAccount.id,
              portfolio_id: portfolioId,
              vector_store_id: vectorStore.id,
              vector_store_name: vectorStoreName
            })
            .select()
            .single();

          if (storeError) {
            console.error('Error saving vector store record:', storeError);
          } else {
            accountPortfolioStores.push(storeRecord);
          }

        } catch (openaiError) {
          console.error('Error creating OpenAI vector store:', openaiError);
          // Continue with other combinations even if one fails
        }
      }

      // Store team knowledge records in database
      for (const portfolioId of accountData.assignedPortfolios) {
        const knowledgeData = accountData.knowledge[portfolioId] || {
          inventory: [],
          instruments: [],
          technical: []
        };

        // Store inventory items
        for (const item of knowledgeData.inventory) {
          if (item.item && item.item.trim()) {
            await supabase.from('team_knowledge').insert({
              team_id: teamId,
              account_id: createdAccount.id,
              portfolio_id: portfolioId,
              category: 'inventory',
              title: item.item,
              content: `Quantity: ${item.quantity}${item.notes ? `, Notes: ${item.notes}` : ''}`,
              metadata: { quantity: item.quantity, notes: item.notes },
              created_by: user.id
            });
          }
        }

        // Store instrument items
        for (let itemIndex = 0; itemIndex < knowledgeData.instruments.length; itemIndex++) {
          const item = knowledgeData.instruments[itemIndex];
          if (item.name && item.name.trim()) {
            let imageMetadata = null;
            
            // Handle image upload if present
            if (item.imageFile) {
              try {
                // Generate unique filename
                const timestamp = Date.now();
                const fileExt = item.imageFile.name.split('.').pop() || 'jpg';
                const fileName = `${createdAccount.name.replace(/\s+/g, '_')}_${portfolioMap[portfolioId]?.replace(/\s+/g, '_')}_${item.name.replace(/\s+/g, '_')}_${timestamp}.${fileExt}`;
                const filePath = `team-images/${teamId}/accounts/${createdAccount.id}/portfolios/${portfolioId}/instruments/${fileName}`;

                // Upload to Supabase Storage
                const arrayBuffer = await item.imageFile.arrayBuffer();
                const { data: uploadData, error: uploadError } = await supabase.storage
                  .from('team-images')
                  .upload(filePath, arrayBuffer, {
                    contentType: item.imageFile.type,
                    upsert: false
                  });

                if (uploadError) {
                  console.error('Error uploading instrument image:', uploadError);
                } else {
                  console.log('🔍 TEAM IMAGE UPLOAD SUCCESS:');
                  console.log('  📄 Instrument name:', item.name);
                  console.log('  📁 Storage file path:', filePath);
                  console.log('  📷 Original filename:', item.imageFile.name);
                  
                  // Create image metadata for database
                  imageMetadata = [{
                    url: filePath,
                    description: item.name,
                    filename: item.imageFile.name
                  }];
                  
                  console.log('  💾 Storing in database:', JSON.stringify(imageMetadata, null, 2));
                }
              } catch (uploadError) {
                console.error('Error processing instrument image:', uploadError);
              }
            }

            await supabase.from('team_knowledge').insert({
              team_id: teamId,
              account_id: createdAccount.id,
              portfolio_id: portfolioId,
              category: 'instruments',
              title: item.name,
              content: item.description,
              images: imageMetadata,
              metadata: {
                name: item.name,
                description: item.description,
                quantity: item.quantity,
                image_url: imageMetadata?.[0]?.url,
                image_name: imageMetadata?.[0]?.filename
              },
              created_by: user.id
            });
          }
        }

        // Store technical items
        for (const item of knowledgeData.technical) {
          if (item.title && item.title.trim()) {
            await supabase.from('team_knowledge').insert({
              team_id: teamId,
              account_id: createdAccount.id,
              portfolio_id: portfolioId,
              category: 'technical',
              title: item.title,
              content: item.content,
              created_by: user.id
            });
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      accounts: createdAccounts,
      accountPortfolioStores,
      message: `${createdAccounts.length} account(s) created successfully with ${accountPortfolioStores.length} knowledge vector stores.`
    });

  } catch (error) {
    console.error('Error in account creation:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 