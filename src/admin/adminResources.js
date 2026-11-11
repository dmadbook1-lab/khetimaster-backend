import FarmField from '../models/farmField.model.js';
import FarmAdvisory from '../advisory/models/farmAdvisory.model.js';
import Labourer from '../models/Labourer.js';
import LabourBooking from '../models/LabourBooking.js';
import Machinery from '../models/Machinery.js';
import MachineryBooking from '../models/MachineryBooking.js';
import Doctor from '../models/Doctor.js';
import DoctorConsultation from '../models/DoctorConsultation.js';
import Plant from '../models/Plant.js';
import NurseryOrder from '../models/NurseryOrder.js';
import MarketListing from '../models/MarketListing.js';
import MarketDeal from '../models/MarketDeal.js';
import CommunityPost from '../models/CommunityPost.js';
import CommunityComment from '../models/CommunityComment.js';
import CommunityReaction from '../models/CommunityReaction.js';
import ArticleCache from '../models/ArticleCache.js';

/*
|--------------------------------------------------------------------------
| ADMIN PANEL — RESOURCES
|--------------------------------------------------------------------------
|
| Every collection the admin panel lists, with what can be searched,
| filtered, sorted and edited. The generic handlers in adminService.js read
| this config, so adding a screen is mostly adding an entry here.
|
|   search       text fields matched with a case-insensitive regex
|   searchUsers  User refs matched by the user's name / email / phone
|   searchRelated refs to another collection matched by its own text fields
|                 (and optionally its owner): [{ field, model, search, userField? }]
|   filters      exact-match query params (booleans listed in `booleans`)
|   editable     fields a PATCH may change (anything else is ignored)
|   beforeUpdate (doc, changes) runs before save, for status side effects
|   afterUpdate  (doc, previous) runs after save
|   beforeDelete (doc) cleans up dependent documents
|
*/

export const USER_FIELDS = 'fullName email phoneNumber avatar state district village';

const BOOKING_STATUSES = ['pending', 'confirmed', 'accepted', 'rejected', 'cancelled', 'completed'];

/*
 * Timestamps and the "cancelled by" marker an admin status change implies,
 * matching what the app's own booking flows set.
 */
const bookingStatusEffects = (doc, changes) => {
  if (!changes.status || changes.status === doc.status) return;

  const now = new Date();

  if (changes.status === 'accepted' || changes.status === 'confirmed') {
    doc.acceptedAt = doc.acceptedAt || now;
  }
  if (changes.status === 'completed') doc.completedAt = now;
  if (changes.status === 'cancelled') {
    doc.cancelledAt = now;
    doc.cancelledBy = 'system';
    doc.cancellationReason = changes.cancellationReason || doc.cancellationReason || 'Cancelled by admin';
  }
  if (changes.status === 'rejected') {
    doc.rejectionReason = changes.rejectionReason || doc.rejectionReason || 'Rejected by admin';
  }
};

/*
 * Bump the provider's completed-jobs counter the first time a booking is
 * completed, as the provider's own "complete" action does.
 */
const countCompletion = (Model, refField, counter) => async (doc, previous) => {
  if (doc.status === 'completed' && previous.status !== 'completed' && doc[refField]) {
    await Model.updateOne({ _id: doc[refField] }, { $inc: { [counter]: 1 } });
  }
};

export const RESOURCES = {
  farms: {
    model: FarmField,
    label: 'Farm',
    populate: [{ path: 'user', select: USER_FIELDS }],
    search: ['fieldName', 'cropName', 'variety'],
    searchUsers: ['user'],
    filters: ['typeOfFarming', 'typeOfIrrigation', 'isBarrenLand', 'cropName', 'user'],
    booleans: ['isBarrenLand'],
    sortable: ['createdAt', 'acre', 'fieldName', 'cropName'],
    editable: ['fieldName', 'cropName', 'variety', 'sowingDate', 'typeOfIrrigation', 'typeOfFarming'],
    beforeDelete: async (doc) => {
      await FarmAdvisory.deleteMany({ farmFieldId: doc._id });
    },
  },

  advisories: {
    model: FarmAdvisory,
    label: 'Advisory',
    populate: [
      {
        path: 'farmFieldId',
        select: 'fieldName cropName acre user',
        populate: { path: 'user', select: USER_FIELDS },
      },
    ],
    // Found through their farm: farm name, crop, or the farm owner's name / email / phone
    searchRelated: [{ field: 'farmFieldId', model: FarmField, search: ['fieldName', 'cropName'], userField: 'user' }],
    filters: ['cropHealth.category', 'activitiesSource', 'language', 'farmFieldId'],
    sortable: ['createdAt', 'cropHealth.percentage'],
    editable: [],
  },

  labourers: {
    model: Labourer,
    label: 'Labourer',
    populate: [{ path: 'user', select: USER_FIELDS }],
    search: ['fullName', 'phoneNumber', 'labourType', 'village', 'district'],
    filters: ['availability', 'isActive', 'gender', 'labourType', 'state', 'wageType'],
    booleans: ['isActive'],
    sortable: ['createdAt', 'rating', 'expectedWage', 'totalJobsCompleted', 'fullName'],
    editable: ['isActive', 'availability'],
  },

  machinery: {
    model: Machinery,
    label: 'Machine',
    populate: [{ path: 'owner', select: USER_FIELDS }],
    search: ['name', 'brand', 'model', 'ownerName', 'category', 'village', 'district'],
    searchUsers: ['owner'],
    filters: ['availability', 'isActive', 'category', 'fuelType', 'state'],
    booleans: ['isActive'],
    sortable: ['createdAt', 'rating', 'pricing.daily', 'totalJobsCompleted', 'name'],
    editable: ['isActive', 'availability'],
  },

  doctors: {
    model: Doctor,
    label: 'Doctor',
    populate: [{ path: 'user', select: USER_FIELDS }],
    search: ['fullName', 'phoneNumber', 'email', 'village', 'district'],
    filters: ['doctorType', 'availability', 'isActive', 'consultationFeeType', 'state'],
    booleans: ['isActive'],
    sortable: ['createdAt', 'rating', 'consultationFee', 'totalConsultations', 'fullName'],
    editable: ['isActive', 'availability'],
  },

  'labour-bookings': {
    model: LabourBooking,
    label: 'Labour booking',
    populate: [
      { path: 'farmer', select: USER_FIELDS },
      { path: 'labourer', select: 'fullName phoneNumber labourType profileImage user' },
    ],
    search: ['workType', 'village', 'district', 'description'],
    searchUsers: ['farmer'],
    searchRelated: [{ field: 'labourer', model: Labourer, search: ['fullName', 'phoneNumber'] }],
    filters: ['status', 'wageType', 'state', 'farmer', 'labourer'],
    sortable: ['createdAt', 'bookingDate', 'totalAmount'],
    editable: ['status'],
    statuses: BOOKING_STATUSES,
    beforeUpdate: bookingStatusEffects,
    afterUpdate: countCompletion(Labourer, 'labourer', 'totalJobsCompleted'),
  },

  'machinery-bookings': {
    model: MachineryBooking,
    label: 'Machinery booking',
    populate: [
      { path: 'farmer', select: USER_FIELDS },
      { path: 'machinery', select: 'name category brand ownerName images owner' },
    ],
    search: ['workType', 'service', 'crop', 'village', 'district', 'farmName'],
    searchUsers: ['farmer'],
    searchRelated: [{ field: 'machinery', model: Machinery, search: ['name', 'ownerName'], userField: 'owner' }],
    filters: ['status', 'pricingType', 'paymentMethod', 'state', 'farmer', 'machinery'],
    sortable: ['createdAt', 'bookingDate', 'totalAmount'],
    editable: ['status'],
    statuses: BOOKING_STATUSES,
    beforeUpdate: bookingStatusEffects,
    afterUpdate: countCompletion(Machinery, 'machinery', 'totalJobsCompleted'),
  },

  'doctor-consultations': {
    model: DoctorConsultation,
    label: 'Consultation',
    populate: [
      { path: 'farmer', select: USER_FIELDS },
      { path: 'doctor', select: 'fullName phoneNumber doctorType profileImage user' },
    ],
    search: ['problemType', 'cropName', 'animalType', 'symptoms', 'village', 'district'],
    searchUsers: ['farmer'],
    searchRelated: [{ field: 'doctor', model: Doctor, search: ['fullName', 'phoneNumber'] }],
    filters: ['status', 'consultationType', 'paymentMethod', 'state', 'farmer', 'doctor'],
    sortable: ['createdAt', 'consultationDate', 'totalAmount'],
    editable: ['status'],
    statuses: BOOKING_STATUSES,
    beforeUpdate: bookingStatusEffects,
    afterUpdate: countCompletion(Doctor, 'doctor', 'totalConsultations'),
  },

  plants: {
    model: Plant,
    label: 'Plant',
    populate: [{ path: 'seller.userId', select: USER_FIELDS }],
    search: ['name', 'category', 'seller.name', 'location.district'],
    searchUsers: ['seller.userId'],
    filters: ['category', 'isActive', 'location.state', 'seller.userId'],
    booleans: ['isActive'],
    sortable: ['createdAt', 'price', 'quantity', 'totalSold', 'rating', 'name'],
    editable: ['isActive', 'price', 'quantity'],
  },

  // Status changes go through adminService.updateNurseryOrder (per-item statuses + stock)
  'nursery-orders': {
    model: NurseryOrder,
    label: 'Nursery order',
    populate: [{ path: 'user', select: USER_FIELDS }],
    search: ['deliveryAddress.fullName', 'deliveryAddress.phoneNumber', 'items.name'],
    searchUsers: ['user'],
    filters: ['orderStatus', 'paymentStatus', 'paymentMethod', 'user'],
    sortable: ['createdAt', 'total'],
    editable: ['paymentStatus'],
  },

  'market-listings': {
    model: MarketListing,
    label: 'Listing',
    populate: [{ path: 'seller', select: USER_FIELDS }],
    search: ['title', 'variety', 'brand', 'description', 'location.district'],
    searchUsers: ['seller'],
    filters: ['kind', 'category', 'status', 'isOrganic', 'location.state', 'seller'],
    booleans: ['isOrganic'],
    sortable: ['createdAt', 'pricePerUnit', 'quantity', 'views', 'title'],
    editable: ['status'],
    statuses: ['ACTIVE', 'PAUSED', 'SOLD', 'DELETED'],
  },

  // Deals reserve and release listing stock, so the admin panel only reads them
  'market-deals': {
    model: MarketDeal,
    label: 'Deal',
    populate: [
      { path: 'buyer', select: USER_FIELDS },
      { path: 'seller', select: USER_FIELDS },
    ],
    search: ['listingSnapshot.title', 'listingSnapshot.category'],
    searchUsers: ['buyer', 'seller'],
    filters: ['status', 'fulfilment', 'buyer', 'seller'],
    sortable: ['createdAt', 'totalAmount'],
    editable: [],
    readOnly: true,
  },

  'community-posts': {
    model: CommunityPost,
    label: 'Post',
    populate: [{ path: 'author', select: USER_FIELDS }],
    search: ['caption', 'hashtags', 'location'],
    searchUsers: ['author'],
    filters: ['type', 'author'],
    sortable: ['createdAt', 'likesCount', 'commentsCount', 'viewsCount'],
    editable: [],
    beforeDelete: async (doc) => {
      await Promise.all([
        CommunityComment.deleteMany({ post: doc._id }),
        CommunityReaction.deleteMany({ post: doc._id }),
      ]);
    },
  },

  'community-comments': {
    model: CommunityComment,
    label: 'Comment',
    populate: [
      { path: 'author', select: USER_FIELDS },
      { path: 'post', select: 'caption type author' },
    ],
    search: ['text'],
    searchUsers: ['author'],
    filters: ['post', 'author'],
    sortable: ['createdAt'],
    editable: [],
    beforeDelete: async (doc) => {
      await CommunityPost.updateOne(
        { _id: doc.post, commentsCount: { $gt: 0 } },
        { $inc: { commentsCount: -1 } }
      );
    },
  },

  articles: {
    model: ArticleCache,
    label: 'Article',
    search: ['title', 'description', 'category'],
    filters: ['source', 'category'],
    sortable: ['publishedAt', 'cachedAt', 'title'],
    defaultSort: { publishedAt: -1 },
    editable: [],
  },
};
