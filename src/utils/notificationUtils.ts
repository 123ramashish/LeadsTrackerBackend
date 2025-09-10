import Notification from "../DataBase/Schema/notification.schema"
import ErrorLog from "../helper/ErrorLog"

export async function Notification_Create(createFor: string[], description: string, title: string, p0?: string,) {
    if (!createFor || !description || !title) {
        return await ErrorLog(`Notification Creating`, new Error(`createFor -> ${createFor} || description -> ${description} || title -> ${title}`))
    }
    await Notification.create(
        {
            createFor: createFor,
            description,
            title,
        }
    )
}