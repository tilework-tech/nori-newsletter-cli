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
  ListContactListsCommand,
  GetContactListCommand,
  UpdateContactListCommand,
  DeleteContactListCommand,
  BatchGetMetricDataCommand,
  CreateEmailTemplateCommand,
  GetEmailTemplateCommand,
  ListEmailTemplatesCommand,
  UpdateEmailTemplateCommand,
  DeleteEmailTemplateCommand,
  TestRenderEmailTemplateCommand,
  SendBulkEmailCommand,
  CreateEmailIdentityCommand,
  GetEmailIdentityCommand,
  ListEmailIdentitiesCommand,
  DeleteEmailIdentityCommand,
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

  listContactLists(): Promise<
    Array<{ name: string; lastUpdatedTimestamp: Date }>
  >;

  getContactList(
    name: string
  ): Promise<{
    name: string;
    description?: string;
    topics: Array<{
      topicName: string;
      displayName: string;
      description?: string;
      defaultSubscriptionStatus: string;
    }>;
    createdTimestamp?: Date;
    lastUpdatedTimestamp?: Date;
    tags: Array<{ key: string; value: string }>;
  } | null>;

  updateContactList(
    name: string,
    options: {
      description?: string;
      topics?: Array<{
        topicName: string;
        displayName: string;
        description?: string;
        defaultSubscriptionStatus: string;
      }>;
    }
  ): Promise<void>;

  deleteContactList(name: string): Promise<void>;

  getAccountInfo(): Promise<{
    sentLast24Hours: number;
    max24HourSend: number;
    maxSendRate: number;
    enforcementStatus: string;
    productionAccessEnabled: boolean;
    sendingEnabled: boolean;
  }>;

  getMetrics(options: {
    startDate: Date;
    endDate: Date;
    metrics: string[];
    identity?: string;
  }): Promise<{
    results: Array<{
      metric: string;
      timestamps: Date[];
      values: number[];
    }>;
    errors: Array<{ metric: string; message: string }>;
  }>;

  createTemplate(
    name: string,
    content: { subject?: string; html?: string; text?: string }
  ): Promise<void>;

  getTemplate(
    name: string
  ): Promise<{
    name: string;
    subject?: string;
    html?: string;
    text?: string;
  } | null>;

  listTemplates(): Promise<Array<{ name: string; createdTimestamp: Date }>>;

  updateTemplate(
    name: string,
    content: { subject?: string; html?: string; text?: string }
  ): Promise<void>;

  deleteTemplate(name: string): Promise<void>;

  testRenderTemplate(name: string, data: string): Promise<string>;

  sendBulkEmail(options: {
    from: string;
    replyTo: string;
    templateName: string;
    defaultTemplateData?: string;
    entries: Array<{
      to: string;
      replacementData?: string;
    }>;
  }): Promise<Array<{ status: string; messageId?: string; error?: string }>>;

  listIdentities(): Promise<
    Array<{
      name: string;
      type: string;
      sendingEnabled: boolean;
      verificationStatus: string;
    }>
  >;

  createIdentity(identity: string): Promise<{
    type: string;
    verifiedForSending: boolean;
    dkimTokens?: string[];
    dkimHostedZone?: string;
  }>;

  getIdentity(identity: string): Promise<{
    name: string;
    type: string;
    verificationStatus: string;
    verifiedForSending: boolean;
    feedbackForwardingStatus: boolean;
    dkim: {
      status: string;
      signingEnabled: boolean;
      tokens?: string[];
      hostedZone?: string;
      currentKeyLength?: string;
    };
    mailFrom?: {
      domain: string;
      status: string;
      behaviorOnMxFailure: string;
    };
  } | null>;

  deleteIdentity(identity: string): Promise<void>;
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

    async listContactLists() {
      const results: Array<{ name: string; lastUpdatedTimestamp: Date }> = [];
      let nextToken: string | undefined;

      do {
        const response = await client.send(
          new ListContactListsCommand({
            ...(nextToken && { NextToken: nextToken }),
          })
        );

        if (response.ContactLists) {
          for (const cl of response.ContactLists) {
            results.push({
              name: cl.ContactListName!,
              lastUpdatedTimestamp: cl.LastUpdatedTimestamp!,
            });
          }
        }
        nextToken = response.NextToken;
      } while (nextToken);

      return results;
    },

    async getContactList(name: string) {
      try {
        const response = await client.send(
          new GetContactListCommand({ ContactListName: name })
        );

        return {
          name: response.ContactListName!,
          description: response.Description,
          topics: (response.Topics ?? []).map((t) => ({
            topicName: t.TopicName!,
            displayName: t.DisplayName!,
            description: t.Description,
            defaultSubscriptionStatus: t.DefaultSubscriptionStatus!,
          })),
          createdTimestamp: response.CreatedTimestamp,
          lastUpdatedTimestamp: response.LastUpdatedTimestamp,
          tags: (response.Tags ?? []).map((t) => ({
            key: t.Key!,
            value: t.Value!,
          })),
        };
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "NotFoundException") {
          return null;
        }
        throw err;
      }
    },

    async updateContactList(
      name: string,
      options: {
        description?: string;
        topics?: Array<{
          topicName: string;
          displayName: string;
          description?: string;
          defaultSubscriptionStatus: string;
        }>;
      }
    ) {
      const current = await client.send(
        new GetContactListCommand({ ContactListName: name })
      );

      const topics = options.topics
        ? options.topics.map((t) => ({
            TopicName: t.topicName,
            DisplayName: t.displayName,
            Description: t.description,
            DefaultSubscriptionStatus: t.defaultSubscriptionStatus as "OPT_IN" | "OPT_OUT",
          }))
        : current.Topics;

      await client.send(
        new UpdateContactListCommand({
          ContactListName: name,
          Topics: topics,
          Description: options.description ?? current.Description,
        })
      );
    },

    async deleteContactList(name: string) {
      await client.send(
        new DeleteContactListCommand({ ContactListName: name })
      );
    },

    async getAccountInfo() {
      const response = await client.send(new GetAccountCommand({}));
      return {
        sentLast24Hours: response.SendQuota?.SentLast24Hours ?? 0,
        max24HourSend: response.SendQuota?.Max24HourSend ?? 0,
        maxSendRate: response.SendQuota?.MaxSendRate ?? 0,
        enforcementStatus: response.EnforcementStatus ?? "UNKNOWN",
        productionAccessEnabled: response.ProductionAccessEnabled ?? false,
        sendingEnabled: response.SendingEnabled ?? false,
      };
    },

    async getMetrics(options: {
      startDate: Date;
      endDate: Date;
      metrics: string[];
      identity?: string;
    }) {
      const queries = options.metrics.map((metric) => ({
        Id: metric.toLowerCase(),
        Namespace: "VDM" as const,
        Metric: metric as "SEND" | "DELIVERY" | "PERMANENT_BOUNCE" | "COMPLAINT",
        StartDate: options.startDate,
        EndDate: options.endDate,
        ...(options.identity && {
          Dimensions: { EMAIL_IDENTITY: options.identity } as Partial<
            Record<"CONFIGURATION_SET" | "EMAIL_IDENTITY" | "ISP", string>
          >,
        }),
      }));

      const response = await client.send(
        new BatchGetMetricDataCommand({ Queries: queries })
      );

      const results = (response.Results ?? []).map((r) => ({
        metric: (r.Id ?? "").toUpperCase(),
        timestamps: r.Timestamps ?? [],
        values: r.Values ?? [],
      }));

      const errors = (response.Errors ?? []).map((e) => ({
        metric: (e.Id ?? "").toUpperCase(),
        message: e.Message ?? "Unknown error",
      }));

      return { results, errors };
    },

    async createTemplate(
      name: string,
      content: { subject?: string; html?: string; text?: string }
    ): Promise<void> {
      await client.send(
        new CreateEmailTemplateCommand({
          TemplateName: name,
          TemplateContent: {
            Subject: content.subject,
            Html: content.html,
            Text: content.text,
          },
        })
      );
    },

    async getTemplate(name: string) {
      try {
        const response = await client.send(
          new GetEmailTemplateCommand({ TemplateName: name })
        );

        return {
          name: response.TemplateName!,
          subject: response.TemplateContent?.Subject,
          html: response.TemplateContent?.Html,
          text: response.TemplateContent?.Text,
        };
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "NotFoundException") {
          return null;
        }
        throw err;
      }
    },

    async listTemplates() {
      const results: Array<{ name: string; createdTimestamp: Date }> = [];
      let nextToken: string | undefined;

      do {
        const response = await client.send(
          new ListEmailTemplatesCommand({
            ...(nextToken && { NextToken: nextToken }),
          })
        );

        if (response.TemplatesMetadata) {
          for (const t of response.TemplatesMetadata) {
            results.push({
              name: t.TemplateName!,
              createdTimestamp: t.CreatedTimestamp!,
            });
          }
        }
        nextToken = response.NextToken;
      } while (nextToken);

      return results;
    },

    async updateTemplate(
      name: string,
      content: { subject?: string; html?: string; text?: string }
    ): Promise<void> {
      await client.send(
        new UpdateEmailTemplateCommand({
          TemplateName: name,
          TemplateContent: {
            Subject: content.subject,
            Html: content.html,
            Text: content.text,
          },
        })
      );
    },

    async deleteTemplate(name: string): Promise<void> {
      await client.send(
        new DeleteEmailTemplateCommand({ TemplateName: name })
      );
    },

    async testRenderTemplate(name: string, data: string): Promise<string> {
      const response = await client.send(
        new TestRenderEmailTemplateCommand({
          TemplateName: name,
          TemplateData: data,
        })
      );

      return response.RenderedTemplate!;
    },

    async sendBulkEmail(bulkOptions: {
      from: string;
      replyTo: string;
      templateName: string;
      defaultTemplateData?: string;
      entries: Array<{
        to: string;
        replacementData?: string;
      }>;
    }): Promise<Array<{ status: string; messageId?: string; error?: string }>> {
      const response = await client.send(
        new SendBulkEmailCommand({
          FromEmailAddress: bulkOptions.from,
          ReplyToAddresses: [bulkOptions.replyTo],
          DefaultContent: {
            Template: {
              TemplateName: bulkOptions.templateName,
              TemplateData: bulkOptions.defaultTemplateData ?? "{}",
            },
          },
          BulkEmailEntries: bulkOptions.entries.map((entry) => ({
            Destination: {
              ToAddresses: [entry.to],
            },
            ...(entry.replacementData && {
              ReplacementEmailContent: {
                ReplacementTemplate: {
                  ReplacementTemplateData: entry.replacementData,
                },
              },
            }),
          })),
        })
      );

      return (response.BulkEmailEntryResults ?? []).map((r) => ({
        status: r.Status ?? "FAILED",
        messageId: r.MessageId,
        error: r.Error,
      }));
    },

    async listIdentities() {
      const results: Array<{
        name: string;
        type: string;
        sendingEnabled: boolean;
        verificationStatus: string;
      }> = [];
      let nextToken: string | undefined;

      do {
        const response = await client.send(
          new ListEmailIdentitiesCommand({
            ...(nextToken && { NextToken: nextToken }),
          })
        );

        if (response.EmailIdentities) {
          for (const id of response.EmailIdentities) {
            results.push({
              name: id.IdentityName!,
              type: id.IdentityType!,
              sendingEnabled: id.SendingEnabled ?? false,
              verificationStatus: id.VerificationStatus ?? "NOT_STARTED",
            });
          }
        }
        nextToken = response.NextToken;
      } while (nextToken);

      return results;
    },

    async createIdentity(identity: string) {
      const response = await client.send(
        new CreateEmailIdentityCommand({ EmailIdentity: identity })
      );

      return {
        type: response.IdentityType ?? "EMAIL_ADDRESS",
        verifiedForSending: response.VerifiedForSendingStatus ?? false,
        dkimTokens: response.DkimAttributes?.Tokens,
        dkimHostedZone: response.DkimAttributes?.SigningHostedZone,
      };
    },

    async getIdentity(identity: string) {
      try {
        const response = await client.send(
          new GetEmailIdentityCommand({ EmailIdentity: identity })
        );

        return {
          name: identity,
          type: response.IdentityType ?? "EMAIL_ADDRESS",
          verificationStatus: response.VerificationStatus ?? "NOT_STARTED",
          verifiedForSending: response.VerifiedForSendingStatus ?? false,
          feedbackForwardingStatus: response.FeedbackForwardingStatus ?? false,
          dkim: {
            status: response.DkimAttributes?.Status ?? "NOT_STARTED",
            signingEnabled: response.DkimAttributes?.SigningEnabled ?? false,
            tokens: response.DkimAttributes?.Tokens,
            hostedZone: response.DkimAttributes?.SigningHostedZone,
            currentKeyLength: response.DkimAttributes?.CurrentSigningKeyLength,
          },
          mailFrom: response.MailFromAttributes?.MailFromDomain
            ? {
                domain: response.MailFromAttributes.MailFromDomain,
                status: response.MailFromAttributes.MailFromDomainStatus ?? "PENDING",
                behaviorOnMxFailure:
                  response.MailFromAttributes.BehaviorOnMxFailure ?? "USE_DEFAULT_VALUE",
              }
            : undefined,
        };
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "NotFoundException") {
          return null;
        }
        throw err;
      }
    },

    async deleteIdentity(identity: string) {
      await client.send(
        new DeleteEmailIdentityCommand({ EmailIdentity: identity })
      );
    },
  };
}
