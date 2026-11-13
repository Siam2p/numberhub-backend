const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema(
  {
    assignmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Assignment',
      required: true,
      index: true,
    },
    providerMessageId: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
    },
    from: {
      type: String,
      required: true,
      trim: true,
    },
    to: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    body: {
      type: String,
      required: true,
    },
    receivedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    retentionExpiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    isRead: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

messageSchema.index({ assignmentId: 1, receivedAt: -1 });
messageSchema.index({ to: 1, receivedAt: -1 });

const Message = mongoose.model('Message', messageSchema);

module.exports = Message;
