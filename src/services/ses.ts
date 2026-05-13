import {
  SESv2Client,
  CreateContactListCommand,
  CreateContactCommand,
  ListContactsCommand,
  GetContactCommand,
  DeleteContactCommand,
  SendEmailCommand,
} from "@aws-sdk/client-sesv2";

export interface SesService {
  createContactList(name: string, topicName: string): Promise<void>;

  createContact(
    listName: string,
    email: string,
    topicName: string,
    attributes?: Record<string, string>
  ): Promise<void>;

  listContacts(
    listName: string,
    topicName: string
  ): Promise<Array<{ email: string; unsubscribeAll: boolean }>>;

  getContact(
    listName: string,
    email: string
  ): Promise<{
    email: string;
    attributes?: Record<string, string>;
    unsubscribeAll: boolean;
  } | null>;

  deleteContact(listName: string, email: string): Promise<void>;

  sendEmail(
    from: string,
    to: string,
    subject: string,
    html: string,
    replyTo: string,
    listName: string,
    topicName: string
  ): Promise<string>;
}

export function createSesService(client: SESv2Client): SesService {
  return {
    async createContactList(name: string, topicName: string): Promise<void> {
      await client.send(
        new CreateContactListCommand({
          ContactListName: name,
          Description: "Newsletter subscribers",
          Topics: [
            {
              TopicName: topicName,
              DisplayName: "Weekly Newsletter",
              Description: "Newsletter updates",
              DefaultSubscriptionStatus: "OPT_IN",
            },
          ],
        })
      );
    },

    async createContact(
      listName: string,
      email: string,
      topicName: string,
      attributes?: Record<string, string>
    ): Promise<void> {
      await client.send(
        new CreateContactCommand({
          ContactListName: listName,
          EmailAddress: email,
          TopicPreferences: [
            {
              TopicName: topicName,
              SubscriptionStatus: "OPT_IN",
            },
          ],
          UnsubscribeAll: false,
          AttributesData: attributes
            ? JSON.stringify(attributes)
            : undefined,
        })
      );
    },

    async listContacts(
      listName: string,
      topicName: string
    ): Promise<Array<{ email: string; unsubscribeAll: boolean }>> {
      const contacts: Array<{ email: string; unsubscribeAll: boolean }> = [];
      let nextToken: string | undefined;

      do {
        const response = await client.send(
          new ListContactsCommand({
            ContactListName: listName,
            Filter: {
              FilteredStatus: "OPT_IN",
              TopicFilter: {
                TopicName: topicName,
                UseDefaultIfPreferenceUnavailable: true,
              },
            },
            ...(nextToken && { NextToken: nextToken }),
          })
        );

        if (response.Contacts) {
          for (const c of response.Contacts) {
            contacts.push({
              email: c.EmailAddress!,
              unsubscribeAll: c.UnsubscribeAll ?? false,
            });
          }
        }
        nextToken = response.NextToken;
      } while (nextToken);

      return contacts;
    },

    async getContact(
      listName: string,
      email: string
    ): Promise<{
      email: string;
      attributes?: Record<string, string>;
      unsubscribeAll: boolean;
    } | null> {
      try {
        const response = await client.send(
          new GetContactCommand({
            ContactListName: listName,
            EmailAddress: email,
          })
        );

        let attributes: Record<string, string> | undefined;
        if (response.AttributesData) {
          attributes = JSON.parse(response.AttributesData);
        }

        return {
          email: response.EmailAddress!,
          attributes,
          unsubscribeAll: response.UnsubscribeAll ?? false,
        };
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "NotFoundException") {
          return null;
        }
        throw err;
      }
    },

    async deleteContact(listName: string, email: string): Promise<void> {
      await client.send(
        new DeleteContactCommand({
          ContactListName: listName,
          EmailAddress: email,
        })
      );
    },

    async sendEmail(
      from: string,
      to: string,
      subject: string,
      html: string,
      replyTo: string,
      listName: string,
      topicName: string
    ): Promise<string> {
      const response = await client.send(
        new SendEmailCommand({
          FromEmailAddress: from,
          ReplyToAddresses: [replyTo],
          Destination: {
            ToAddresses: [to],
          },
          Content: {
            Simple: {
              Subject: { Data: subject, Charset: "UTF-8" },
              Body: {
                Html: { Data: html, Charset: "UTF-8" },
              },
            },
          },
          ListManagementOptions: {
            ContactListName: listName,
            TopicName: topicName,
          },
        })
      );

      return response.MessageId ?? "unknown";
    },
  };
}
