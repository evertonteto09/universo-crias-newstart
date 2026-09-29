import { getMyWriterAccount } from "../services/writer.service.js";

export async function requireWriter() {
    try {
        return await getMyWriterAccount();
    } catch (error) {
        console.error("[Writer Guard]", error);
        location.href = "./login.html";
        return null;
    }
}
