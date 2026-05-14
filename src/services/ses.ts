import {
  SESv2Client,
  CreateContactListCommand,
  CreateContactCommand,
  ListContactsCommand,
  GetContactCommand,
  UpdateContactCommand,
  DeleteContactCommand,
  SendEmailCommand,
  GetAccountCommand,
  ListSuppressedDestinationsCommand,
  GetSuppressedDestinationCommand,
  PutSuppressedDestinationCommand,
  DeleteSuppressedDestinationCommand,
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
    topicPreferences: Array<{ topicName: string; status: string }>;
    attributes?: Record<string, string>;
    unsubscribeAll: boolean;
  } | null>;

  listUnsubscribedContacts(
    listName: string,
    topicName: string
  ): Promise<Array<{ email: string; unsubscribeAll: boolean }>>;

  updateContact(
    listName: string,
    email: string,
    options: {
      topicPreferences?: Array<{ topicName: string; status: string }>;
      unsubscribeAll?: boolean;
      attributes?: Record<string, string>;
    }
  ): Promise<void>;

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

  getMaxSendRate(): Promise<number>;

  listSuppressedDestinations(options?: {
    reasons?: string[];
    startDate?: Date;
    endDate?: Date;
  }): Promise<Array<{ email: string; reason: string; lastUpdateTime: Date }>>;

  getSuppressedDestination(
    email: string
  ): Promise<{
    email: string;
    reason: string;
    lastUpdateTime: Date;
    messageId?: string;
    feedbackId?: string;
  } | null>;

  putSuppressedDestination(email: string, reason: string): Promise<void>;

  deleteSuppressedDestination(email: string): Promise<void>;
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
      topicPreferences: Array<{ topicName: string; status: string }>;
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

        const topicPreferences = (response.TopicPreferences ?? []).map((tp) => ({
          topicName: tp.TopicName!,
          status: tp.SubscriptionStatus!,
        }));

        return {
          email: response.EmailAddress!,
          topicPreferences,
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

    async listUnsubscribedContacts(
      listName: string,
      topicName: string
    ): Promise<Array<{ email: string; unsubscribeAll: boolean }>> {
      // OPT_OUT filter is broken at the AWS service level (GitHub issue #8742).
      // Workaround: fetch all contacts and filter client-side.
      const contacts: Array<{ email: string; unsubscribeAll: boolean }> = [];
      let nextToken: string | undefined;

      do {
        const response = await client.send(
          new ListContactsCommand({
            ContactListName: listName,
            ...(nextToken && { NextToken: nextToken }),
          })
        );

        if (response.Contacts) {
          for (const c of response.Contacts) {
            const isUnsubscribeAll = c.UnsubscribeAll ?? false;
            const topicPref = c.TopicPreferences?.find(
              (tp) => tp.TopicName === topicName
            );
            const isTopicOptOut = topicPref?.SubscriptionStatus === "OPT_OUT";

            if (isUnsubscribeAll || isTopicOptOut) {
              contacts.push({
                email: c.EmailAddress!,
                unsubscribeAll: isUnsubscribeAll,
              });
            }
          }
        }
        nextToken = response.NextToken;
      } while (nextToken);

      return contacts;
    },

    async updateContact(
      listName: string,
      email: string,
      options: {
        topicPreferences?: Array<{ topicName: string; status: string }>;
        unsubscribeAll?: boolean;
        attributes?: Record<string, string>;
      }
    ): Promise<void> {
      const current = await client.send(
        new GetContactCommand({
          ContactListName: listName,
          EmailAddress: email,
        })
      );

      const topicPreferences = options.topicPreferences
        ? options.topicPreferences.map((tp) => ({
            TopicName: tp.topicName,
            SubscriptionStatus: tp.status as "OPT_IN" | "OPT_OUT",
          }))
        : current.TopicPreferences;

      let attributesData = current.AttributesData;
      if (options.attributes !== undefined) {
        const existing = attributesData ? JSON.parse(attributesData) : {};
        Object.assign(existing, options.attributes);
        attributesData = JSON.stringify(existing);
      }

      await client.send(
        new UpdateContactCommand({
          ContactListName: listName,
          EmailAddress: email,
          TopicPreferences: topicPreferences,
          UnsubscribeAll: options.unsubscribeAll ?? current.UnsubscribeAll,
          AttributesData: attributesData,
        })
      );
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

    async getMaxSendRate(): Promise<number> {
      try {
        const response = await client.send(new GetAccountCommand({}));
        return response.SendQuota?.MaxSendRate ?? 1;
      } catch {
        return 1;
      }
    },

    async listSuppressedDestinations(
      options?: { reasons?: string[]; startDate?: Date; endDate?: Date }
    ): Promise<Array<{ email: string; reason: string; lastUpdateTime: Date }>> {
      const results: Array<{ email: string; reason: string; lastUpdateTime: Date }> = [];
      let nextToken: string | undefined;

      do {
        const response = await client.send(
          new ListSuppressedDestinationsCommand({
            Reasons: options?.reasons as ("BOUNCE" | "COMPLAINT")[] | undefined,
            StartDate: options?.startDate,
            EndDate: options?.endDate,
            ...(nextToken && { NextToken: nextToken }),
          })
        );

        if (response.SuppressedDestinationSummaries) {
          for (const s of response.SuppressedDestinationSummaries) {
            results.push({
              email: s.EmailAddress!,
              reason: s.Reason!,
              lastUpdateTime: s.LastUpdateTime!,
            });
          }
        }
        nextToken = response.NextToken;
      } while (nextToken);

      return results;
    },

    async getSuppressedDestination(
      email: string
    ): Promise<{
      email: string;
      reason: string;
      lastUpdateTime: Date;
      messageId?: string;
      feedbackId?: string;
    } | null> {
      try {
        const response = await client.send(
          new GetSuppressedDestinationCommand({ EmailAddress: email })
        );

        const dest = response.SuppressedDestination!;
        return {
          email: dest.EmailAddress!,
          reason: dest.Reason!,
          lastUpdateTime: dest.LastUpdateTime!,
          messageId: dest.Attributes?.MessageId,
          feedbackId: dest.Attributes?.FeedbackId,
        };
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "NotFoundException") {
          return null;
        }
        throw err;
      }
    },

    async putSuppressedDestination(email: string, reason: string): Promise<void> {
      await client.send(
        new PutSuppressedDestinationCommand({
          EmailAddress: email,
          Reason: reason as "BOUNCE" | "COMPLAINT",
        })
      );
    },

    async deleteSuppressedDestination(email: string): Promise<void> {
      await client.send(
        new DeleteSuppressedDestinationCommand({ EmailAddress: email })
      );
    },
  };
}
