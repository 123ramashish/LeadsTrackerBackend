import Log from "../DataBase/Schema/LogModel";

export default async function ErrorLog (name:string,error:any) {
    await Log.create({
        errorName:name,
        code:error?.code,
        errorDescription:error?.message,
        other:JSON.stringify(error),
    })
}