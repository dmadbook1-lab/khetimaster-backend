import mongoose from 'mongoose';

/*
|--------------------------------------------------------------------------
| MARKET SAVED LISTING
|--------------------------------------------------------------------------
|
| Listings a user has bookmarked / added to their wishlist.
|
*/

const marketSavedListingSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    listing: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MarketListing',
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

marketSavedListingSchema.index({ user: 1, listing: 1 }, { unique: true });

marketSavedListingSchema.index({ user: 1, createdAt: -1 });

const MarketSavedListing = mongoose.model('MarketSavedListing', marketSavedListingSchema);

export default MarketSavedListing;
