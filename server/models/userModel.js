const mongoose = require("mongoose");

const Schema = mongoose.Schema;

// Create a new instance of mongoose.Schema, assign to 'userSchema' variable:
// Each user document in DB should fit this schema
const userSchema = new Schema({
  firstName: {
    type: String,
    required: true,
  },
  lastName: {
    type: String,
    required: true,
  },
  password: {
    type: String,
    required: true,
  },
  city: {
    type: String,
    required: false,
  },
  stateProvince: {
    type: String,
    required: false,
  },
  country: {
    type: String,
    required: false,
  },
  phoneCountry: {
    type: String,
    required: false,
  },
  phoneCountryCode: {
    type: String,
    required: false,
  },
  phoneNumberWithoutCountryCode: {
    type: String,
    required: false,
  },
  instagram: {
    type: String,
    required: false,
  },
  facebook: {
    type: String,
    required: false,
  },
  x: {
    type: String,
    required: false,
  },
  interests: {
    type: Array,
    required: true,
  },
  about: {
    type: String,
    required: false,
  },
  friendRequestsReceived: {
    type: Array,
    required: true,
  },
  friendRequestsSent: {
    type: Array,
    required: true,
  },
  hostingCredits: {
    type: Number,
    required: true,
  },
  profileImage: {
    type: String,
    required: false,
  },
  profileVisibleTo: {
    type: String,
    required: true,
  },
  subscriptionType: {
    type: String,
    required: false,
  },
  whoCanAddUserAsOrganizer: {
    type: String,
    required: true,
  },
  whoCanInviteUser: {
    type: String,
    required: true,
  },
  username: {
    type: String,
    required: true,
  },
  friends: {
    type: Array,
    required: true,
  },
  emailAddress: {
    type: String,
    required: true,
  },
});

// Export, so that schema can be used in other files
module.exports = mongoose.model("User", userSchema);