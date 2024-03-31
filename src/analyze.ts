import { uuid, Action, ActionProps, AudioPlayer, ChatHistory, Clipboard, language, llm, res } from "@enconvo/api";

import {
    AIMessagePromptTemplate,
    ChatPromptTemplate,
    HumanMessagePromptTemplate,
    SystemMessagePromptTemplate
} from "@langchain/core/prompts"

export default async function main(req: Request) {
    try {
        const { options } = await req.json()
        const { text, context } = options

        let translateText = text || context || await Clipboard.selectedText();


        if (!translateText) {
            return new Response("", { status: 400, statusText: "No text to be processed" })
        }

        const requestId = uuid()

        if (translateText) {
            const displayText = (translateText).replace(/\n/g, "\n> ");
            await res.context({ id: requestId, role: "human", content: `\n\n> ${displayText}\n\n` })
        }

        let sourceLang = await language.detect(translateText);


        let responseLanguage = "";

        if (options.responseLanguage && options.responseLanguage !== "auto") {

            responseLanguage = `Response In Language: ${options.responseLanguage}`;
        }

        const isWord = language.isWord(sourceLang, translateText);

        let commandMessage;

        if (!isWord) {
            commandMessage = HumanMessagePromptTemplate.fromTemplate(`Please help me study the grammar, key vocabulary (with phonetic symbols), and key phrases of the sentences in the original text based on my English proficiency. The key words should be at my current English level, and simple words should not be listed as key words. Use emoji to enhance the teaching and make it more engaging.
            
            Text:\n{text}
            
            {responseLanguage}
            `);
        } else {
            commandMessage = HumanMessagePromptTemplate.fromTemplate(`Please teach me how to use this word according to my English level (provide the pronunciation), and use emoji to enhance the understanding of the knowledge points for a more enriching teaching.
            
            Word:\n{text}
            
            {responseLanguage}
            `);
        }

        const template = ChatPromptTemplate.fromPromptMessages([
            SystemMessagePromptTemplate.fromTemplate("You are a senior English private tutor who will give me one-on-one English lessons. You are good at explaining English knowledge to me in popular and concise language. My English level is currently at the B2 level of the CEFR. During the teaching process, a focus will be placed on combining theory with practical oral communication."),
            AIMessagePromptTemplate.fromTemplate(`Okay, I will provide English teaching for you based on your current level of English.`),
            commandMessage
        ]);


        const messages = await template.formatMessages({
            text: translateText,
            responseLanguage: responseLanguage
        });

        const chat = llm.chatModel(options.llm);

        let result = "";
        if (options.auto_audio_play === 'true') {
            await AudioPlayer.streamPlay(result, false, true)
        }

        const stream = await chat.stream(messages);

        res.write("", true)
        for await (const chunk of stream) {
            const token = chunk.content
            result += token;
            res.write(token).then()
            if (token && options.auto_audio_play === 'true') {
                result += token;
                AudioPlayer.streamPlay(result, false, false, options.tts).then()
            }
        }

        if (options.auto_audio_play === 'true') {
            AudioPlayer.streamPlay(result, true).then();
        }



        await ChatHistory.saveChatMessages({
            input: translateText, output: result, requestId, llmOptions: options.llm
        });


        const actions: ActionProps[] = [
            Action.Paste(result, true),
            Action.PlayAudio(result, undefined, false, options.tts),
            Action.Copy(result)
        ]
        const output = {
            content: result,
            actions: actions
        }

        return output;

    } catch (err) {
        return "error" + err;
    }
}
