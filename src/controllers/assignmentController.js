const assignmentService = require('../services/assignmentService');
const { logAuditEvent } = require('../utils/auditLogger');

class AssignmentController {
  async createAssignment(req, res, next) {
    try {
      const { userId, phoneNumberId, durationHours } = req.body;
      if (!userId || !phoneNumberId) {
        return res.status(400).json({
          success: false,
          message: 'userId and phoneNumberId are required.',
        });
      }

      const assignment = await assignmentService.assignNumber(
        userId,
        phoneNumberId,
        durationHours || 24
      );

      await logAuditEvent({
        req,
        action: 'CREATE_ASSIGNMENT',
        targetType: 'Assignment',
        targetId: assignment._id,
        details: { userId, phoneNumberId, durationHours },
      });

      res.status(201).json({
        success: true,
        assignment,
      });
    } catch (error) {
      next(error);
    }
  }

  async getAssignments(req, res, next) {
    try {
      const { page, limit, status, userId, search } = req.query;
      const result = await assignmentService.listAssignments({
        page: page ? parseInt(page, 10) : 1,
        limit: limit ? parseInt(limit, 10) : 20,
        status,
        userId,
        search,
      });

      res.status(200).json({
        success: true,
        ...result,
      });
    } catch (error) {
      next(error);
    }
  }

  async getAssignmentById(req, res, next) {
    try {
      const assignment = await assignmentService.getAssignmentById(req.params.id);
      if (!assignment) {
        return res.status(404).json({ success: false, message: 'Assignment not found.' });
      }

      res.status(200).json({
        success: true,
        assignment,
      });
    } catch (error) {
      next(error);
    }
  }

  async release(req, res, next) {
    try {
      const { id } = req.params;
      const { reason = 'admin_revoked' } = req.body || {};

      const assignment = await assignmentService.releaseAssignment(id, { reason });

      await logAuditEvent({
        req,
        action: 'RELEASE_ASSIGNMENT',
        targetType: 'Assignment',
        targetId: assignment._id,
        details: { reason },
      });

      res.status(200).json({
        success: true,
        message: 'Assignment released successfully.',
        assignment,
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new AssignmentController();
