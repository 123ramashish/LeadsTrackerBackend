import Task from '../DataBase/Schema/task.schema';
import RepeatTask from '../DataBase/Schema/repeatTask.schema';
import User from '../DataBase/Schema/user.schema';
import { DateTime } from 'luxon';
import mongoose from 'mongoose';

const getLocalTimeZone = async (): Promise<string> => {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
};

export const createTaskFromRepeat = async (repeatTask: any) => {
  // Validate necessary fields
  if (!repeatTask.taskTitle || !repeatTask.taskDate || !repeatTask.dueDate || !repeatTask.priority || !repeatTask.location || !repeatTask.estimatedTime || !repeatTask.company) {
    throw new Error("Repeat task missing required fields");
  }

  // Assignees fallback: if none given, assign all users in company
  let assignees: string[] = repeatTask.assignee || [];
  if (!Array.isArray(assignees) || assignees.length === 0) {
    const users = await User.find({ company: repeatTask.company });
    if (!users.length) throw new Error("No users found for company");
    assignees = users.map((u) => u._id.toString());
  }

  const totalValue = Number(repeatTask.estimatedTime.value);
  const unit = repeatTask.estimatedTime.unit;

  const perUserValue = Math.floor(totalValue / assignees.length);
  const userEstimatedTime = assignees.map((userId) => ({
    user: userId,
    estimatedTime: { unit, value: perUserValue },
  }));

  const localTimeZone = await getLocalTimeZone();
  const startDate = new Date(
    DateTime.fromJSDate(repeatTask.taskDate).setZone(localTimeZone).toISO()!
  );
  const endDate = new Date(
    DateTime.fromJSDate(repeatTask.dueDate).setZone(localTimeZone).toISO()!
  );

  const userStartDate = assignees.map((userId) => ({
    user: userId,
    date: startDate,
  }));

  const userEndDate = assignees.map((userId) => ({
    user: userId,
    date: endDate,
  }));

  const dueDate = assignees.map((userId) => ({
    user: userId,
    date: [endDate],
  }));

  const individualBucket = assignees.map((userId) => ({
    user: userId,
    individual: false,
  }));

  const status = assignees.map((userId) => ({
    user: userId,
    status: "assignee",
  }));

  const task = new Task({
    taskTitle: repeatTask.taskTitle,
    taskDescription: repeatTask.taskDescription || "",
    taskDate: startDate,
    estimatedTime: { unit, value: totalValue },
    assignee: assignees,
    userEstimatedTime,
    priority: repeatTask.priority,
    location: repeatTask.location,
    address: repeatTask.address || null,
    startDate: userStartDate,
    endDate: userEndDate,
    dueDate,
    createdBy: repeatTask.createdBy,
    tags: repeatTask.tags || [],
    notes: repeatTask.notes || "",
    status,
    company: new mongoose.Types.ObjectId(repeatTask.company),
    individualBucket,
    companyBucket: false,
    repeatTaskId: [repeatTask._id],
  });

  await task.save();

  // Add task ID to repeatTask's repeatTaskId array
  await RepeatTask.updateOne(
    { _id: repeatTask._id },
    { $push: { repeatTaskId: task._id } }
  );

  return task;
};
