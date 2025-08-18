import { Request, Response } from "express";
import mongoose from "mongoose";
import { DateTime } from "luxon";
import LeadModel from "../DataBase/Schema/leads.schema";
import Task from "../DataBase/Schema/task.schema";
interface AuthRequest extends Request {
  user?: {
    sub: string;
    email: string;
    role: string;
  };
}
export default class LeadController {
  // 📌 Create Lead
  static async createLead(req: Request, res: Response): Promise<Response> {
    try {
      const { partyName, email, phone, contactPerson, comments, project } =
        req.body;

      if (!partyName || !email || !phone || !contactPerson) {
        return res.status(400).json({
          message:
            "Missing required fields: Party Name, Email, Phone, or Contact Person",
        });
      }

      const lead = await LeadModel.create({
        PartyName: partyName,
        Email: email,
        Phone: phone,
        ContactPerson: contactPerson,
        Comments: comments || "",
        Project: project || "",
      });

      return res.status(201).json({
        message: "Lead Created Successfully",
        data: lead,
      });
    } catch (error: any) {
      return res.status(500).json({
        message: error?.message || "Internal server error",
      });
    }
  }

  // 📌 Get Leads with filters + pagination
  static async getLeads(req: Request, res: Response): Promise<Response> {
    try {
      const { assigneeTo, page = "1", limit = "10", date } = req.query;

      const query: any = {};
      if (assigneeTo) query.assigneeTo = assigneeTo;

      if (date) {
        const startOfDay = new Date(`${date}T00:00:00Z`);
        const endOfDay = new Date(`${date}T23:59:59Z`);
        query.updatedAt = { $gte: startOfDay, $lte: endOfDay };
      }

      const pageNum = Number(page);
      const limitNum = Number(limit);

      const [leads, totalLeads] = await Promise.all([
        LeadModel.find(query)
          .skip((pageNum - 1) * limitNum)
          .limit(limitNum)
          .sort({ updatedAt: -1 }),
        LeadModel.countDocuments(query),
      ]);

      return res.status(200).json({
        message: "Leads fetched successfully",
        data: {
          leads,
          pagination: {
            currentPage: pageNum,
            totalPages: Math.ceil(totalLeads / limitNum),
            totalLeads,
          },
        },
      });
    } catch (error: any) {
      return res.status(500).json({
        message: error?.message || "Internal server error",
      });
    }
  }

  static async assignLeads(req: AuthRequest, res: Response): Promise<Response> {
    try {
      const { assign, assignTo } = req.body;
      const user: any = req.user;

      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }
      if (!assign || !assignTo || !Array.isArray(assignTo)) {
        return res
          .status(400)
          .json({ message: "Payload is missing or invalid" });
      }

      const leads_ = await LeadModel.find({ _id: { $in: assignTo } }).lean();
      const localTimeZone = DateTime.local().zoneName;

      let leadsDetails = `<p>Assigned Leads:</p><ul>`;
      leads_.forEach((lead, index) => {
        leadsDetails += `
          <li>
            <strong>${index + 1}. ${lead.ContactPerson || "N/A"}</strong> - 
            Email: ${lead.Email || "N/A"} - 
            Phone: ${lead.Phone || "N/A"} - 
            Party Name: ${lead.PartyName || "N/A"} - 
            Project: ${lead.Project || "N/A"}
          </li>
        `;
      });
      leadsDetails += `</ul>`;

      const taskTitle = `Leads Calling Task (${leads_.length} Lead${
        leads_.length > 1 ? "s" : ""
      })`;

      await Promise.all(
        leads_.map((lead) =>
          LeadModel.findByIdAndUpdate(
            lead._id,
            {
              assigneeTo: new mongoose.Types.ObjectId(assign),
              updatedAt: new Date(),
              assignee: true,
            },
            { new: true }
          )
        )
      );

      await Task.create({
        taskTitle,
        taskDescription: leadsDetails,
        priority: "medium",
        estimatedTime: { unit: "Minutes", value: 5 * assignTo.length },
        taskDate: new Date(DateTime.now().setZone(localTimeZone).toISO()!),
        startDate: {
          user: new mongoose.Types.ObjectId(user.sub),
          date: new Date(DateTime.now().setZone(localTimeZone).toISO()!),
        },
        dueDate: new Date(
          DateTime.now().setZone(localTimeZone).endOf("day").toISO()!
        ),
        assignee: new mongoose.Types.ObjectId(assign),
        status: {
          user: new mongoose.Types.ObjectId(user.sub),
          status: "assigned",
        },
        createdBy: user?.sub,
        taskType: "Regular",
        noOfEntry: "1",
      });

      return res.status(200).json({ message: "Leads Assigned Successfully" });
    } catch (error: any) {
      return res.status(500).json({
        message: error?.message || "Internal server error",
      });
    }
  }
}
