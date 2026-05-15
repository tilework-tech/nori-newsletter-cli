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
  CreateConfigurationSetCommand,
  GetConfigurationSetCommand,
  ListConfigurationSetsCommand,
  DeleteConfigurationSetCommand,
  CreateConfigurationSetEventDestinationCommand,
  GetConfigurationSetEventDestinationsCommand,
  DeleteConfigurationSetEventDestinationCommand,
  GetEmailAddressInsightsCommand,
  CreateImportJobCommand,
  GetImportJobCommand,
  ListImportJobsCommand,
  CreateExportJobCommand,
  GetExportJobCommand,
  ListExportJobsCommand,
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

  createConfigSet(
    name: string,
    options?: {
      tlsPolicy?: string;
      sendingPoolName?: string;
      maxDeliverySeconds?: number;
      reputationMetricsEnabled?: boolean;
      sendingEnabled?: boolean;
      suppressedReasons?: string[];
      trackingDomain?: string;
      trackingHttpsPolicy?: string;
      vdmEngagementMetrics?: string;
      vdmOptimizedDelivery?: string;
    }
  ): Promise<void>;

  getConfigSet(
    name: string
  ): Promise<{
    name: string;
    deliveryOptions?: {
      tlsPolicy?: string;
      sendingPoolName?: string;
      maxDeliverySeconds?: number;
    };
    reputationOptions?: {
      reputationMetricsEnabled: boolean;
      lastFreshStart?: Date;
    };
    sendingOptions?: {
      sendingEnabled: boolean;
    };
    suppressionOptions?: {
      suppressedReasons: string[];
    };
    trackingOptions?: {
      customRedirectDomain: string;
      httpsPolicy?: string;
    };
    vdmOptions?: {
      engagementMetrics?: string;
      optimizedSharedDelivery?: string;
    };
    tags: Array<{ key: string; value: string }>;
  } | null>;

  listConfigSets(): Promise<Array<{ name: string }>>;

  deleteConfigSet(name: string): Promise<void>;

  createEventDestination(
    configSetName: string,
    destName: string,
    definition: {
      enabled?: boolean;
      matchingEventTypes: string[];
      snsTopicArn?: string;
      eventBridgeBusArn?: string;
      kinesisStreamArn?: string;
      kinesisRoleArn?: string;
      cloudWatchDimensions?: Array<{
        name: string;
        valueSource: string;
        defaultValue: string;
      }>;
    }
  ): Promise<void>;

  getEventDestinations(
    configSetName: string
  ): Promise<
    Array<{
      name: string;
      enabled: boolean;
      matchingEventTypes: string[];
      destinationType: string;
      destinationDetails: Record<string, string | undefined>;
    }>
  >;

  deleteEventDestination(
    configSetName: string,
    destName: string
  ): Promise<void>;

  getEmailAddressInsights(email: string): Promise<{
    isValid: string;
    evaluations: {
      hasValidSyntax: string;
      hasValidDnsRecords: string;
      mailboxExists: string;
      isRoleAddress: string;
      isDisposable: string;
      isRandomInput: string;
    };
  }>;

  createImportJob(options: {
    destinationType: "CONTACT_LIST" | "SUPPRESSION_LIST";
    action: "PUT" | "DELETE";
    s3Url: string;
    dataFormat: "CSV" | "JSON";
    contactListName?: string;
  }): Promise<{ jobId: string }>;

  getImportJob(jobId: string): Promise<{
    jobId: string;
    destinationType: string;
    action: string;
    s3Url: string;
    dataFormat: string;
    jobStatus: string;
    createdTimestamp: Date;
    completedTimestamp?: Date;
    processedRecordsCount?: number;
    failedRecordsCount?: number;
    failureMessage?: string;
    failedRecordsS3Url?: string;
  } | null>;

  listImportJobs(destinationType?: string): Promise<
    Array<{
      jobId: string;
      destinationType: string;
      jobStatus: string;
      createdTimestamp: Date;
      processedRecordsCount?: number;
      failedRecordsCount?: number;
    }>
  >;

  createExportJob(options: {
    sourceType: "METRICS_DATA" | "MESSAGE_INSIGHTS";
    dataFormat: "CSV" | "JSON";
    startDate: Date;
    endDate: Date;
    metrics?: string[];
    identity?: string;
    fromAddress?: string;
    destination?: string;
  }): Promise<{ jobId: string }>;

  getExportJob(jobId: string): Promise<{
    jobId: string;
    sourceType: string;
    jobStatus: string;
    dataFormat: string;
    s3Url?: string;
    createdTimestamp: Date;
    completedTimestamp?: Date;
    processedRecordsCount?: number;
    exportedRecordsCount?: number;
    failureMessage?: string;
  } | null>;

  listExportJobs(sourceType?: string, status?: string): Promise<
    Array<{
      jobId: string;
      sourceType: string;
      jobStatus: string;
      createdTimestamp: Date;
      completedTimestamp?: Date;
    }>
  >;
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

    async createConfigSet(
      name: string,
      options?: {
        tlsPolicy?: string;
        sendingPoolName?: string;
        maxDeliverySeconds?: number;
        reputationMetricsEnabled?: boolean;
        sendingEnabled?: boolean;
        suppressedReasons?: string[];
        trackingDomain?: string;
        trackingHttpsPolicy?: string;
        vdmEngagementMetrics?: string;
        vdmOptimizedDelivery?: string;
      }
    ): Promise<void> {
      await client.send(
        new CreateConfigurationSetCommand({
          ConfigurationSetName: name,
          ...(options?.tlsPolicy || options?.sendingPoolName || options?.maxDeliverySeconds
            ? {
                DeliveryOptions: {
                  TlsPolicy: options.tlsPolicy as "REQUIRE" | "OPTIONAL" | undefined,
                  SendingPoolName: options.sendingPoolName,
                  MaxDeliverySeconds: options.maxDeliverySeconds,
                },
              }
            : {}),
          ...(options?.reputationMetricsEnabled !== undefined
            ? {
                ReputationOptions: {
                  ReputationMetricsEnabled: options.reputationMetricsEnabled,
                },
              }
            : {}),
          ...(options?.sendingEnabled !== undefined
            ? { SendingOptions: { SendingEnabled: options.sendingEnabled } }
            : {}),
          ...(options?.suppressedReasons
            ? {
                SuppressionOptions: {
                  SuppressedReasons: options.suppressedReasons as ("BOUNCE" | "COMPLAINT")[],
                },
              }
            : {}),
          ...(options?.trackingDomain
            ? {
                TrackingOptions: {
                  CustomRedirectDomain: options.trackingDomain,
                  HttpsPolicy: options.trackingHttpsPolicy as
                    | "REQUIRE"
                    | "REQUIRE_OPEN_ONLY"
                    | "OPTIONAL"
                    | undefined,
                },
              }
            : {}),
          ...(options?.vdmEngagementMetrics || options?.vdmOptimizedDelivery
            ? {
                VdmOptions: {
                  ...(options.vdmEngagementMetrics
                    ? {
                        DashboardOptions: {
                          EngagementMetrics: options.vdmEngagementMetrics as
                            | "ENABLED"
                            | "DISABLED",
                        },
                      }
                    : {}),
                  ...(options.vdmOptimizedDelivery
                    ? {
                        GuardianOptions: {
                          OptimizedSharedDelivery: options.vdmOptimizedDelivery as
                            | "ENABLED"
                            | "DISABLED",
                        },
                      }
                    : {}),
                },
              }
            : {}),
        })
      );
    },

    async getConfigSet(name: string) {
      try {
        const response = await client.send(
          new GetConfigurationSetCommand({ ConfigurationSetName: name })
        );

        return {
          name: response.ConfigurationSetName!,
          deliveryOptions: response.DeliveryOptions
            ? {
                tlsPolicy: response.DeliveryOptions.TlsPolicy,
                sendingPoolName: response.DeliveryOptions.SendingPoolName,
                maxDeliverySeconds: response.DeliveryOptions.MaxDeliverySeconds,
              }
            : undefined,
          reputationOptions: response.ReputationOptions
            ? {
                reputationMetricsEnabled:
                  response.ReputationOptions.ReputationMetricsEnabled ?? false,
                lastFreshStart: response.ReputationOptions.LastFreshStart,
              }
            : undefined,
          sendingOptions: response.SendingOptions
            ? {
                sendingEnabled: response.SendingOptions.SendingEnabled ?? true,
              }
            : undefined,
          suppressionOptions: response.SuppressionOptions?.SuppressedReasons
            ? {
                suppressedReasons: response.SuppressionOptions.SuppressedReasons as string[],
              }
            : undefined,
          trackingOptions: response.TrackingOptions?.CustomRedirectDomain
            ? {
                customRedirectDomain: response.TrackingOptions.CustomRedirectDomain,
                httpsPolicy: response.TrackingOptions.HttpsPolicy,
              }
            : undefined,
          vdmOptions:
            response.VdmOptions?.DashboardOptions || response.VdmOptions?.GuardianOptions
              ? {
                  engagementMetrics:
                    response.VdmOptions?.DashboardOptions?.EngagementMetrics,
                  optimizedSharedDelivery:
                    response.VdmOptions?.GuardianOptions?.OptimizedSharedDelivery,
                }
              : undefined,
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

    async listConfigSets() {
      const results: Array<{ name: string }> = [];
      let nextToken: string | undefined;

      do {
        const response = await client.send(
          new ListConfigurationSetsCommand({
            ...(nextToken && { NextToken: nextToken }),
          })
        );

        if (response.ConfigurationSets) {
          for (const name of response.ConfigurationSets) {
            results.push({ name });
          }
        }
        nextToken = response.NextToken;
      } while (nextToken);

      return results;
    },

    async deleteConfigSet(name: string) {
      await client.send(
        new DeleteConfigurationSetCommand({ ConfigurationSetName: name })
      );
    },

    async createEventDestination(
      configSetName: string,
      destName: string,
      definition: {
        enabled?: boolean;
        matchingEventTypes: string[];
        snsTopicArn?: string;
        eventBridgeBusArn?: string;
        kinesisStreamArn?: string;
        kinesisRoleArn?: string;
        cloudWatchDimensions?: Array<{
          name: string;
          valueSource: string;
          defaultValue: string;
        }>;
      }
    ): Promise<void> {
      await client.send(
        new CreateConfigurationSetEventDestinationCommand({
          ConfigurationSetName: configSetName,
          EventDestinationName: destName,
          EventDestination: {
            Enabled: definition.enabled ?? true,
            MatchingEventTypes: definition.matchingEventTypes as Array<
              | "SEND"
              | "REJECT"
              | "BOUNCE"
              | "COMPLAINT"
              | "DELIVERY"
              | "OPEN"
              | "CLICK"
              | "RENDERING_FAILURE"
              | "DELIVERY_DELAY"
              | "SUBSCRIPTION"
            >,
            ...(definition.snsTopicArn
              ? { SnsDestination: { TopicArn: definition.snsTopicArn } }
              : {}),
            ...(definition.eventBridgeBusArn
              ? { EventBridgeDestination: { EventBusArn: definition.eventBridgeBusArn } }
              : {}),
            ...(definition.kinesisStreamArn && definition.kinesisRoleArn
              ? {
                  KinesisFirehoseDestination: {
                    DeliveryStreamArn: definition.kinesisStreamArn,
                    IamRoleArn: definition.kinesisRoleArn,
                  },
                }
              : {}),
            ...(definition.cloudWatchDimensions
              ? {
                  CloudWatchDestination: {
                    DimensionConfigurations: definition.cloudWatchDimensions.map((d) => ({
                      DimensionName: d.name,
                      DimensionValueSource: d.valueSource as
                        | "MESSAGE_TAG"
                        | "EMAIL_HEADER"
                        | "LINK_TAG",
                      DefaultDimensionValue: d.defaultValue,
                    })),
                  },
                }
              : {}),
          },
        })
      );
    },

    async getEventDestinations(configSetName: string) {
      const response = await client.send(
        new GetConfigurationSetEventDestinationsCommand({
          ConfigurationSetName: configSetName,
        })
      );

      return (response.EventDestinations ?? []).map((dest) => {
        let destinationType = "UNKNOWN";
        const destinationDetails: Record<string, string | undefined> = {};

        if (dest.SnsDestination) {
          destinationType = "SNS";
          destinationDetails.topicArn = dest.SnsDestination.TopicArn;
        } else if (dest.EventBridgeDestination) {
          destinationType = "EventBridge";
          destinationDetails.eventBusArn = dest.EventBridgeDestination.EventBusArn;
        } else if (dest.KinesisFirehoseDestination) {
          destinationType = "Kinesis Firehose";
          destinationDetails.deliveryStreamArn =
            dest.KinesisFirehoseDestination.DeliveryStreamArn;
          destinationDetails.iamRoleArn = dest.KinesisFirehoseDestination.IamRoleArn;
        } else if (dest.CloudWatchDestination) {
          destinationType = "CloudWatch";
        }

        return {
          name: dest.Name!,
          enabled: dest.Enabled ?? true,
          matchingEventTypes: (dest.MatchingEventTypes ?? []) as string[],
          destinationType,
          destinationDetails,
        };
      });
    },

    async deleteEventDestination(configSetName: string, destName: string) {
      await client.send(
        new DeleteConfigurationSetEventDestinationCommand({
          ConfigurationSetName: configSetName,
          EventDestinationName: destName,
        })
      );
    },

    async getEmailAddressInsights(email: string) {
      const response = await client.send(
        new GetEmailAddressInsightsCommand({ EmailAddress: email })
      );

      const v = response.MailboxValidation;
      const e = v?.Evaluations;

      return {
        isValid: v?.IsValid?.ConfidenceVerdict ?? "UNKNOWN",
        evaluations: {
          hasValidSyntax: e?.HasValidSyntax?.ConfidenceVerdict ?? "UNKNOWN",
          hasValidDnsRecords: e?.HasValidDnsRecords?.ConfidenceVerdict ?? "UNKNOWN",
          mailboxExists: e?.MailboxExists?.ConfidenceVerdict ?? "UNKNOWN",
          isRoleAddress: e?.IsRoleAddress?.ConfidenceVerdict ?? "UNKNOWN",
          isDisposable: e?.IsDisposable?.ConfidenceVerdict ?? "UNKNOWN",
          isRandomInput: e?.IsRandomInput?.ConfidenceVerdict ?? "UNKNOWN",
        },
      };
    },

    async createImportJob(options) {
      const destination: Record<string, unknown> = {};
      if (options.destinationType === "CONTACT_LIST") {
        destination.ContactListDestination = {
          ContactListName: options.contactListName,
          ContactListImportAction: options.action,
        };
      } else {
        destination.SuppressionListDestination = {
          SuppressionListImportAction: options.action,
        };
      }

      const response = await client.send(
        new CreateImportJobCommand({
          ImportDestination: destination as any,
          ImportDataSource: {
            S3Url: options.s3Url,
            DataFormat: options.dataFormat,
          },
        })
      );

      return { jobId: response.JobId! };
    },

    async getImportJob(jobId: string) {
      try {
        const response = await client.send(
          new GetImportJobCommand({ JobId: jobId })
        );

        let destinationType = "UNKNOWN";
        let action = "UNKNOWN";
        if (response.ImportDestination?.ContactListDestination) {
          destinationType = "CONTACT_LIST";
          action = response.ImportDestination.ContactListDestination.ContactListImportAction!;
        } else if (response.ImportDestination?.SuppressionListDestination) {
          destinationType = "SUPPRESSION_LIST";
          action = response.ImportDestination.SuppressionListDestination.SuppressionListImportAction!;
        }

        return {
          jobId: response.JobId!,
          destinationType,
          action,
          s3Url: response.ImportDataSource?.S3Url ?? "",
          dataFormat: response.ImportDataSource?.DataFormat ?? "CSV",
          jobStatus: response.JobStatus ?? "UNKNOWN",
          createdTimestamp: response.CreatedTimestamp ?? new Date(),
          completedTimestamp: response.CompletedTimestamp,
          processedRecordsCount: response.ProcessedRecordsCount,
          failedRecordsCount: response.FailedRecordsCount,
          failureMessage: response.FailureInfo?.ErrorMessage,
          failedRecordsS3Url: response.FailureInfo?.FailedRecordsS3Url,
        };
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "NotFoundException") {
          return null;
        }
        throw err;
      }
    },

    async listImportJobs(destinationType?: string) {
      const results: Array<{
        jobId: string;
        destinationType: string;
        jobStatus: string;
        createdTimestamp: Date;
        processedRecordsCount?: number;
        failedRecordsCount?: number;
      }> = [];
      let nextToken: string | undefined;

      do {
        const response = await client.send(
          new ListImportJobsCommand({
            ImportDestinationType: destinationType as "SUPPRESSION_LIST" | "CONTACT_LIST" | undefined,
            ...(nextToken && { NextToken: nextToken }),
          })
        );

        if (response.ImportJobs) {
          for (const job of response.ImportJobs) {
            let destType = "UNKNOWN";
            if (job.ImportDestination?.ContactListDestination) {
              destType = "CONTACT_LIST";
            } else if (job.ImportDestination?.SuppressionListDestination) {
              destType = "SUPPRESSION_LIST";
            }

            results.push({
              jobId: job.JobId!,
              destinationType: destType,
              jobStatus: job.JobStatus ?? "UNKNOWN",
              createdTimestamp: job.CreatedTimestamp ?? new Date(),
              processedRecordsCount: job.ProcessedRecordsCount,
              failedRecordsCount: job.FailedRecordsCount,
            });
          }
        }
        nextToken = response.NextToken;
      } while (nextToken);

      return results;
    },

    async createExportJob(options) {
      const dataSource: Record<string, unknown> = {};

      if (options.sourceType === "METRICS_DATA") {
        const metrics = (options.metrics ?? ["SEND", "DELIVERY", "PERMANENT_BOUNCE", "COMPLAINT"]).map(
          (m) => ({ Name: m, Aggregation: "VOLUME" })
        );
        const dimensions: Record<string, string[]> = {};
        if (options.identity) {
          dimensions.EMAIL_IDENTITY = [options.identity];
        } else {
          dimensions.EMAIL_IDENTITY = ["*"];
        }
        dataSource.MetricsDataSource = {
          Dimensions: dimensions,
          Namespace: "VDM",
          Metrics: metrics,
          StartDate: options.startDate,
          EndDate: options.endDate,
        };
      } else {
        const filters: Record<string, unknown> = {};
        if (options.fromAddress) filters.FromEmailAddress = [options.fromAddress];
        if (options.destination) filters.Destination = [options.destination];
        dataSource.MessageInsightsDataSource = {
          StartDate: options.startDate,
          EndDate: options.endDate,
          ...(Object.keys(filters).length > 0 && { Include: filters }),
        };
      }

      const response = await client.send(
        new CreateExportJobCommand({
          ExportDataSource: dataSource as any,
          ExportDestination: {
            DataFormat: options.dataFormat,
          },
        })
      );

      return { jobId: response.JobId! };
    },

    async getExportJob(jobId: string) {
      try {
        const response = await client.send(
          new GetExportJobCommand({ JobId: jobId })
        );

        return {
          jobId: response.JobId!,
          sourceType: response.ExportSourceType ?? "UNKNOWN",
          jobStatus: response.JobStatus ?? "UNKNOWN",
          dataFormat: response.ExportDestination?.DataFormat ?? "CSV",
          s3Url: response.ExportDestination?.S3Url,
          createdTimestamp: response.CreatedTimestamp ?? new Date(),
          completedTimestamp: response.CompletedTimestamp,
          processedRecordsCount: response.Statistics?.ProcessedRecordsCount,
          exportedRecordsCount: response.Statistics?.ExportedRecordsCount,
          failureMessage: response.FailureInfo?.ErrorMessage,
        };
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "NotFoundException") {
          return null;
        }
        throw err;
      }
    },

    async listExportJobs(sourceType?: string, status?: string) {
      const results: Array<{
        jobId: string;
        sourceType: string;
        jobStatus: string;
        createdTimestamp: Date;
        completedTimestamp?: Date;
      }> = [];
      let nextToken: string | undefined;

      do {
        const response = await client.send(
          new ListExportJobsCommand({
            ExportSourceType: sourceType as "METRICS_DATA" | "MESSAGE_INSIGHTS" | undefined,
            JobStatus: status as "CREATED" | "PROCESSING" | "COMPLETED" | "FAILED" | "CANCELLED" | undefined,
            ...(nextToken && { NextToken: nextToken }),
          })
        );

        if (response.ExportJobs) {
          for (const job of response.ExportJobs) {
            results.push({
              jobId: job.JobId!,
              sourceType: job.ExportSourceType ?? "UNKNOWN",
              jobStatus: job.JobStatus ?? "UNKNOWN",
              createdTimestamp: job.CreatedTimestamp ?? new Date(),
              completedTimestamp: job.CompletedTimestamp,
            });
          }
        }
        nextToken = response.NextToken;
      } while (nextToken);

      return results;
    },
  };
}
