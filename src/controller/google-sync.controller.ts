import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Company from '../DataBase/Schema/company.schema';
import { USER_ROLES } from '../DataBase/Schema/user.schema';

// ─── Helper: Encrypt/Decrypt API Key (Basic Example) ─────────────────────────
// In production, use a proper encryption library like crypto or bcrypt
const encryptApiKey = (key: string): string => {
  // TODO: Implement proper encryption with environment secret
  return Buffer.from(key).toString('base64');
};

const decryptApiKey = (encryptedKey: string): string => {
  // TODO: Implement proper decryption
  return Buffer.from(encryptedKey, 'base64').toString('utf-8');
};

// ─── Helper: Validate Google Place ID Format ─────────────────────────────────
const isValidPlaceId = (placeId: string): boolean => {
  return /^ChIJ[a-zA-Z0-9_-]+$/.test(placeId);
};

export default class GoogleSyncController {
  
  // ─── GET /api/google-sync/config/:companyId ────────────────────────────────
  async getGoogleConfig(req: Request, res: Response): Promise<void> {
    try {
      const authUser = (req as any).user as { id: string; role: string; companyId?: string };
      const { companyId } = req.params;

      // Authorization: Users can only access their own company config
      const targetCompanyId = authUser.role === USER_ROLES.SUPER_ADMIN 
        ? companyId || authUser.companyId 
        : authUser.companyId;

      if (!targetCompanyId) {
        res.status(400).json({ message: 'Company ID is required' });
        return;
      }

      const company = await Company.findById(targetCompanyId)
        .select('+googleSync.googleApiKey') // Include encrypted API key
        .lean();

      if (!company || company.isDeleted || !company.isActive) {
        res.status(404).json({ message: 'Company not found or inactive' });
        return;
      }

      // Return config WITHOUT exposing the actual API key
      const safeConfig = company.googleSync 
        ? {
            ...company.googleSync,
            googleApiKey: company.googleSync.googleApiKey ? '***REDACTED***' : undefined,
            googlePlaceId: company.googleSync.googlePlaceId,
          }
        : null;

      res.json({
        companyId: company._id,
        companyName: company.name,
        hasConfig: !!company.googleSync?.googlePlaceId,
        config: safeConfig,
      });

    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      console.error('[getGoogleConfig]', error);
      res.status(500).json({ message: 'Failed to fetch Google config', error: msg });
    }
  }

  // ─── POST /api/google-sync/config ─────────────────────────────────────────
  async saveGoogleConfig(req: Request, res: Response): Promise<void> {
    try {
      const authUser = (req as any).user as { id: string; role: string; companyId?: string };
      const { 
        companyId, 
        googlePlaceId, 
        googleApiKey, 
        autoSync, 
        syncThreshold 
      } = req.body;

      // Authorization
      const targetCompanyId = authUser.role === USER_ROLES.SUPER_ADMIN 
        ? companyId 
        : authUser.companyId;

      if (!targetCompanyId) {
        res.status(400).json({ message: 'Company ID is required' });
        return;
      }

      // Validate input
      if (!googlePlaceId || !isValidPlaceId(googlePlaceId)) {
        res.status(400).json({ 
          message: 'Valid Google Place ID is required (format: ChIJ*)' 
        });
        return;
      }

      if (!googleApiKey || googleApiKey.length < 20) {
        res.status(400).json({ 
          message: 'Valid Google API Key is required' 
        });
        return;
      }

      // Find and update company
      const company:any = await Company.findById(targetCompanyId);
      
      if (!company || company.isDeleted || !company.isActive) {
        res.status(404).json({ message: 'Company not found or inactive' });
        return;
      }

      // Update Google sync config
      company.googleSync = {
        ...(company.googleSync || {}),
        googlePlaceId,
        googleApiKey: encryptApiKey(googleApiKey), // Encrypt before storing
        autoSync: autoSync ?? company.googleSync?.autoSync ?? false,
        syncThreshold: syncThreshold ?? company.googleSync?.syncThreshold ?? 4,
      };

      await company.save();

      // Return safe response (no API key)
      res.status(201).json({
        message: 'Google configuration saved successfully',
        config: {
          googlePlaceId: company.googleSync?.googlePlaceId,
          autoSync: company.googleSync?.autoSync,
          syncThreshold: company.googleSync?.syncThreshold,
          totalPushed: company.googleSync?.totalPushed || 0,
        },
      });

    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      console.error('[saveGoogleConfig]', error);
      
      if (error instanceof mongoose.Error.ValidationError) {
        res.status(400).json({ message: 'Validation failed', errors: error.errors });
        return;
      }
      
      res.status(500).json({ message: 'Failed to save Google config', error: msg });
    }
  }

  // ─── DELETE /api/google-sync/config/:companyId ────────────────────────────
  async deleteGoogleConfig(req: Request, res: Response): Promise<void> {
    try {
      const authUser = (req as any).user as { id: string; role: string; companyId?: string };
      const { companyId } = req.params;

      // Authorization: Only SuperAdmin or company owner can delete config
      const targetCompanyId = authUser.role === USER_ROLES.SUPER_ADMIN 
        ? companyId 
        : authUser.companyId;

      if (!targetCompanyId) {
        res.status(400).json({ message: 'Company ID is required' });
        return;
      }

      const company = await Company.findById(targetCompanyId);
      
      if (!company || company.isDeleted || !company.isActive) {
        res.status(404).json({ message: 'Company not found or inactive' });
        return;
      }

      // Remove Google sync config
      company.googleSync = undefined;
      await company.save();

      res.json({ message: 'Google configuration deleted successfully' });

    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      console.error('[deleteGoogleConfig]', error);
      res.status(500).json({ message: 'Failed to delete Google config', error: msg });
    }
  }

  // ─── POST /api/google-sync/test-connection ────────────────────────────────
  async testGoogleConnection(req: Request, res: Response): Promise<void> {
    try {
      const { googlePlaceId, googleApiKey } = req.body;

      if (!googlePlaceId || !googleApiKey) {
        res.status(400).json({ message: 'googlePlaceId and googleApiKey are required' });
        return;
      }

      // TODO: Implement actual Google Places API test call
      // For now, simulate a connection test
      await new Promise(resolve => setTimeout(resolve, 800));

      // Mock response - replace with real API call
      const mockResult = {
        success: true,
        placeName: 'Test Clinic Location',
        address: '123 Main St, City, Country',
        rating: 4.7,
        reviewCount: 128,
      };

      res.json({
        message: 'Connection test successful',
        data: mockResult,
      });

    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      console.error('[testGoogleConnection]', error);
      res.status(500).json({ 
        message: 'Connection test failed', 
        error: msg,
        hint: 'Check your Place ID and API key permissions' 
      });
    }
  }

  // ─── POST /api/google-sync/update-rating-cache ────────────────────────────
  async updateRatingCache(req: Request, res: Response): Promise<void> {
    try {
      const authUser = (req as any).user as { id: string; role: string; companyId?: string };
      const { companyId } = req.body;

      const targetCompanyId = authUser.role === USER_ROLES.SUPER_ADMIN 
        ? companyId 
        : authUser.companyId;

      if (!targetCompanyId) {
        res.status(400).json({ message: 'Company ID is required' });
        return;
      }

      const company = await Company.findById(targetCompanyId)
        .select('+googleSync.googleApiKey')
        .lean();

      if (!company?.googleSync?.googlePlaceId || !company?.googleSync?.googleApiKey) {
        res.status(400).json({ message: 'Google configuration not found' });
        return;
      }

      // TODO: Call Google Places API to fetch actual rating
      // const places = google.places('v1');
      // const response = await places.places.get({
      //   name: `places/${company.googleSync.googlePlaceId}`,
      //   key: decryptApiKey(company.googleSync.googleApiKey),
      // });

      // Mock data for demo
      const mockRating = {
        rating: 4.7,
        reviewCount: 128,
        lastFetched: new Date(),
      };

      // Update company with cached rating
      await Company.findByIdAndUpdate(targetCompanyId, {
        $set: {
          'googleRating': mockRating,
          'googleSync.lastSyncedAt': new Date(),
        },
      });

      res.json({
        message: 'Rating cache updated',
        data: mockRating,
      });

    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      console.error('[updateRatingCache]', error);
      res.status(500).json({ message: 'Failed to update rating cache', error: msg });
    }
  }
}