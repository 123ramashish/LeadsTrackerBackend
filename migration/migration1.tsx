// migration.ts - Script to migrate from old lead system to enhanced system

import mongoose from 'mongoose';
import Lead, { LeadStatus, LeadType, LeadSource, LeadPriority } from '../src/DataBase/Schema/Leads.schema';
import Activity, { ActivityType } from '../src/DataBase/Schema/Activity.schema';

/**
 * Migration Script for Lead Tracking System
 * 
 * This script migrates data from the old lead system to the new enhanced system.
 * Run this once after deploying the new schema.
 */

// Old status to new status mapping
const STATUS_MIGRATION_MAP: Record<string, LeadStatus> = {
  'created': LeadStatus.CREATED,
  'message sent': LeadStatus.CONTACTED,
  'dead': LeadStatus.LOST,
  'follow up': LeadStatus.FOLLOW_UP,
  'interested': LeadStatus.QUALIFIED
};

// Old type to new type mapping
const TYPE_MIGRATION_MAP: Record<string, LeadType> = {
  'lead': LeadType.LEAD,
  'client': LeadType.CLIENT,
  'customer': LeadType.CUSTOMER
};

interface MigrationStats {
  totalLeads: number;
  migratedLeads: number;
  failedLeads: number;
  scoresCalculated: number;
  activitiesCreated: number;
  errors: Array<{ leadId: string; error: string }>;
}

async function migrateLeads(): Promise<MigrationStats> {
  const stats: MigrationStats = {
    totalLeads: 0,
    migratedLeads: 0,
    failedLeads: 0,
    scoresCalculated: 0,
    activitiesCreated: 0,
    errors: []
  };

  try {
    console.log('🚀 Starting lead migration...');

    // Get all leads
    const leads = await Lead.find({});
    stats.totalLeads = leads.length;

    console.log(`📊 Found ${stats.totalLeads} leads to migrate`);

    for (const lead of leads) {
      try {
        let needsUpdate = false;
        const updates: any = {};

        // 1. Migrate status
        if (lead.status && STATUS_MIGRATION_MAP[lead.status]) {
          const oldStatus = lead.status;
          updates.status = STATUS_MIGRATION_MAP[lead.status];
          needsUpdate = true;

          // Create activity for status migration
          if (lead.company) {
            await Activity.create({
              leadId: lead._id,
              companyId: lead.company,
              type: ActivityType.STATUS_CHANGED,
              title: `Status migrated: ${oldStatus} → ${updates.status}`,
              description: 'Automatic migration from old system',
              performedBy: lead.createdBy || lead._id,
              previousValue: oldStatus,
              newValue: updates.status,
              activityDate: new Date()
            });
            stats.activitiesCreated++;
          }
        }

        // 2. Migrate type
        if (lead.type && TYPE_MIGRATION_MAP[lead.type]) {
          updates.type = TYPE_MIGRATION_MAP[lead.type];
          needsUpdate = true;
        }

        // 3. Add new required fields with defaults
        if (!lead.source) {
          updates.source = LeadSource.OTHER;
          needsUpdate = true;
        }

        if (!lead.priority) {
          updates.priority = LeadPriority.MEDIUM;
          needsUpdate = true;
        }

        if (lead.score === undefined || lead.score === null) {
          updates.score = 0;
          needsUpdate = true;
        }

        // 4. Initialize engagement metrics if missing
        if (lead.totalInteractions === undefined) {
          updates.totalInteractions = 0;
          needsUpdate = true;
        }
        if (lead.emailsSent === undefined) {
          updates.emailsSent = 0;
          needsUpdate = true;
        }
        if (lead.callsMade === undefined) {
          updates.callsMade = 0;
          needsUpdate = true;
        }
        if (lead.meetingsHeld === undefined) {
          updates.meetingsHeld = 0;
          needsUpdate = true;
        }

        // 5. Set lastActivityAt if not set
        if (!lead.lastActivityAt) {
          updates.lastActivityAt = lead.updatedAt || lead.createdAt;
          needsUpdate = true;
        }

        // 6. Apply updates if needed
        if (needsUpdate) {
          await Lead.updateOne({ _id: lead._id }, { $set: updates });
        }

        // 7. Calculate and update lead score
        const updatedLead = await Lead.findById(lead._id);
        if (updatedLead) {
        //   await updatedLead.updateScore();
          await updatedLead.save();
          stats.scoresCalculated++;
        }

        // 8. Create initial activity if none exists
        const existingActivities = await Activity.countDocuments({ leadId: lead._id });
        if (existingActivities === 0 && lead.company) {
          await Activity.create({
            leadId: lead._id,
            companyId: lead.company,
            type: ActivityType.LEAD_CREATED,
            title: `Lead created: ${lead.name}`,
            description: 'Migrated from old system',
            performedBy: lead.createdBy || lead._id,
            activityDate: lead.createdAt || new Date(),
            metadata: {
              migration: true,
              originalStatus: lead.status,
              originalType: lead.type
            }
          });
          stats.activitiesCreated++;
        }

        stats.migratedLeads++;

        if (stats.migratedLeads % 100 === 0) {
          console.log(`✅ Migrated ${stats.migratedLeads}/${stats.totalLeads} leads...`);
        }
      } catch (error: any) {
        console.error(`❌ Error migrating lead ${lead._id}:`, error.message);
        stats.failedLeads++;
        // stats.errors.push({
        //   leadId: lead._id.toString(),
        //   error: error.message
        // });
      }
    }

    console.log('\n✨ Migration completed!');
    console.log('═══════════════════════════════════════');
    console.log(`📊 Total leads: ${stats.totalLeads}`);
    console.log(`✅ Migrated successfully: ${stats.migratedLeads}`);
    console.log(`❌ Failed: ${stats.failedLeads}`);
    console.log(`🎯 Scores calculated: ${stats.scoresCalculated}`);
    console.log(`📝 Activities created: ${stats.activitiesCreated}`);
    console.log('═══════════════════════════════════════\n');

    if (stats.errors.length > 0) {
      console.log('⚠️  Errors encountered:');
      stats.errors.forEach((err, index) => {
        console.log(`${index + 1}. Lead ${err.leadId}: ${err.error}`);
      });
    }

    return stats;
  } catch (error: any) {
    console.error('💥 Migration failed:', error);
    throw error;
  }
}

async function cleanupDuplicates(): Promise<void> {
  console.log('🧹 Checking for duplicate leads...');

  const duplicates = await Lead.aggregate([
    {
      $match: {
        isDeleted: false,
        $or: [
          { email: { $ne: null, $exists: true } },
          { phone: { $ne: null, $exists: true } }
        ]
      }
    },
    {
      $group: {
        _id: {
          company: '$company',
          email: '$email',
          phone: '$phone'
        },
        leads: { $push: '$_id' },
        count: { $sum: 1 }
      }
    },
    {
      $match: { count: { $gt: 1 } }
    }
  ]);

  if (duplicates.length === 0) {
    console.log('✅ No duplicates found');
    return;
  }

  console.log(`⚠️  Found ${duplicates.length} duplicate groups`);

  for (const dup of duplicates) {
    // Keep the first lead, mark others as deleted
    const [keepLead, ...deletedLeads] = dup.leads;
    
    await Lead.updateMany(
      { _id: { $in: deletedLeads } },
      {
        $set: {
          isDeleted: true,
          deletedAt: new Date()
        }
      }
    );

    console.log(`🗑️  Soft-deleted ${deletedLeads.length} duplicate(s) for lead ${keepLead}`);
  }

  console.log('✅ Duplicate cleanup completed');
}

async function createIndexes(): Promise<void> {
  console.log('🔧 Creating database indexes...');

  try {
    // Lead indexes
    await Lead.collection.createIndex({ company: 1, status: 1, createdAt: -1 });
    await Lead.collection.createIndex({ company: 1, assignedTo: 1, status: 1 });
    await Lead.collection.createIndex({ company: 1, isFavorite: 1, createdAt: -1 });
    await Lead.collection.createIndex({ company: 1, priority: 1, nextFollowUp: 1 });
    await Lead.collection.createIndex({ company: 1, score: -1 });
    await Lead.collection.createIndex({ email: 1, company: 1 }, { unique: true, sparse: true });
    await Lead.collection.createIndex({ phone: 1, company: 1 }, { unique: true, sparse: true });
    await Lead.collection.createIndex({ tags: 1 });

    // Activity indexes
    await Activity.collection.createIndex({ leadId: 1, activityDate: -1 });
    await Activity.collection.createIndex({ companyId: 1, type: 1, activityDate: -1 });
    await Activity.collection.createIndex({ companyId: 1, performedBy: 1, activityDate: -1 });
    await Activity.collection.createIndex({ leadId: 1, type: 1 });

    console.log('✅ Indexes created successfully');
  } catch (error: any) {
    console.error('❌ Error creating indexes:', error.message);
    throw error;
  }
}

async function validateMigration(): Promise<void> {
  console.log('🔍 Validating migration...');

  const issues: string[] = [];

  // Check for leads without required fields
  const leadsWithoutSource = await Lead.countDocuments({
    isDeleted: false,
    $or: [
      { source: { $exists: false } },
      { source: null }
    ]
  });

  if (leadsWithoutSource > 0) {
    issues.push(`${leadsWithoutSource} leads missing source field`);
  }

  const leadsWithoutPriority = await Lead.countDocuments({
    isDeleted: false,
    $or: [
      { priority: { $exists: false } },
      { priority: null }
    ]
  });

  if (leadsWithoutPriority > 0) {
    issues.push(`${leadsWithoutPriority} leads missing priority field`);
  }

  const leadsWithoutScore = await Lead.countDocuments({
    isDeleted: false,
    $or: [
      { score: { $exists: false } },
      { score: null }
    ]
  });

  if (leadsWithoutScore > 0) {
    issues.push(`${leadsWithoutScore} leads missing score field`);
  }

  // Check for invalid statuses
  const leadsWithOldStatus = await Lead.countDocuments({
    isDeleted: false,
    status: { $nin: Object.values(LeadStatus) }
  });

  if (leadsWithOldStatus > 0) {
    issues.push(`${leadsWithOldStatus} leads with invalid status`);
  }

  if (issues.length > 0) {
    console.log('⚠️  Validation issues found:');
    issues.forEach((issue, index) => {
      console.log(`${index + 1}. ${issue}`);
    });
  } else {
    console.log('✅ Validation passed - all leads migrated correctly');
  }
}

// Main migration function
export async function runMigration(mongoUri: string): Promise<void> {
  try {
    // Connect to database
    console.log('🔌 Connecting to database...');
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to database\n');

    // Step 1: Clean up duplicates
    await cleanupDuplicates();
    console.log();

    // Step 2: Migrate leads
    const stats = await migrateLeads();
    console.log();

    // Step 3: Create indexes
    await createIndexes();
    console.log();

    // Step 4: Validate migration
    await validateMigration();
    console.log();

    console.log('🎉 Migration completed successfully!');
    
    // Disconnect
    await mongoose.disconnect();
    console.log('👋 Database connection closed');
  } catch (error: any) {
    console.error('💥 Migration failed:', error);
    await mongoose.disconnect();
    throw error;
  }
}

// Rollback function (in case of issues)
export async function rollbackMigration(mongoUri: string): Promise<void> {
  try {
    console.log('🔄 Rolling back migration...');
    await mongoose.connect(mongoUri);

    // Restore old statuses from activity logs
    const activities = await Activity.find({
      type: ActivityType.STATUS_CHANGED,
      'metadata.migration': true
    });

    for (const activity of activities) {
      if (activity.previousValue) {
        await Lead.updateOne(
          { _id: activity.leadId },
          { $set: { status: activity.previousValue } }
        );
      }
    }

    // Delete migration activities
    await Activity.deleteMany({ 'metadata.migration': true });

    console.log('✅ Rollback completed');
    await mongoose.disconnect();
  } catch (error: any) {
    console.error('❌ Rollback failed:', error);
    await mongoose.disconnect();
    throw error;
  }
}

// CLI execution
if (require.main === module) {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/lead-tracker';
  const command = process.argv[2];

  if (command === 'rollback') {
    rollbackMigration(mongoUri)
      .then(() => process.exit(0))
      .catch(() => process.exit(1));
  } else {
    runMigration(mongoUri)
      .then(() => process.exit(0))
      .catch(() => process.exit(1));
  }
}