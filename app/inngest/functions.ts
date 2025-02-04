import { BetaAnalyticsDataClient } from "@google-analytics/data";
import type { GetEvents } from "inngest";
import { VariableType, jsonToGraphQLQuery } from "json-to-graphql-query";
import type { PaginatedDocs } from "payload/database";
import qs from "qs";

import { settings } from "mana-config";
import type {
   Collection,
   CustomPage,
   Entry,
   Post,
   Site,
} from "~/db/payload-types";
import { gqlFormat } from "~/utils";
import { authGQLFetcher, authRestFetcher } from "~/utils/fetchers";

import { inngest } from "./client";

type Events = GetEvents<typeof inngest>;

export const loadAnalyticsCron = inngest.createFunction(
   { id: "site-analytics-load" },
   { cron: "0 */4 * * *" },
   async ({ event, step }) => {
      const query = {
         query: {
            siteData: {
               __aliasFor: "Sites",
               __args: {
                  where: {
                     gaTagId: {
                        exists: true,
                     },
                     gaPropertyId: {
                        exists: true,
                     },
                  },
               },
               docs: {
                  id: true,
                  name: true,
                  type: true,
                  slug: true,
                  gaPropertyId: true,
                  gaTagId: true,
                  collections: {
                     id: true,
                     slug: true,
                     customDatabase: true,
                  },
               },
            },
         },
      };

      const graphql_query = jsonToGraphQLQuery(query, {
         pretty: true,
      });

      //@ts-ignore
      const { siteData }: { siteData: PaginatedDocs<Site> } =
         await authGQLFetcher({
            document: graphql_query,
         });

      const sites = siteData.docs;

      if (sites) {
         const events = sites.map<Events["analytics/site.analytics.send"]>(
            (site) => {
               return {
                  name: "analytics/site.analytics.send",
                  data: {
                     siteId: site.id,
                     siteType: site.type,
                     siteSlug: site.slug,
                     gaPropertyId: site.gaPropertyId,
                     collections: site.collections,
                  },
               };
            },
         );
         await step.sendEvent("fan-out-site-analytics-update", events);

         return { count: events.length };
      }
   },
);

export const updateSiteAnalytics = inngest.createFunction(
   { id: "site-analytics-report" },
   { event: "analytics/site.analytics.send" },
   async ({ event, step }) => {
      const { gaPropertyId, siteSlug, collections, siteId } = event.data;

      const analyticsDataClient = new BetaAnalyticsDataClient({
         credentials: {
            client_email: process.env.GA_CLIENT_EMAIL,
            // https://stackoverflow.com/questions/55459528/using-private-key-in-a-env-file
            private_key: process.env.GA_PRIVATE_KEY?.replace(/\\n/g, "\n"),
         },
      });

      const [response] = await analyticsDataClient.runReport({
         property: `properties/${gaPropertyId}`,
         dateRanges: [
            {
               startDate: "2daysAgo",
               endDate: "today",
            },
         ],
         dimensions: [
            {
               name: "pagePath",
            },
         ],
         orderBys: [
            {
               desc: true,
               metric: {
                  metricName: "screenPageViews",
               },
            },
         ],
         metrics: [
            {
               name: "screenPageViews",
            },
         ],
      });

      const filteredRows =
         response.rows &&
         response?.rows
            .filter((doc) => {
               const path =
                  doc?.dimensionValues && doc?.dimensionValues[0]?.value;

               const pathSection = path && path.split("/");
               //Exclude homepage
               if (pathSection?.length == 2 && pathSection[1] == siteSlug) {
                  return false;
               }
               return true;
            })
            .map((doc) => {
               const pageViews =
                  doc?.metricValues && doc?.metricValues[0]?.value;
               const path =
                  doc?.dimensionValues && doc?.dimensionValues[0]?.value;

               const pathSection = path && path.split("/");

               //Custom pages
               if (
                  pathSection?.length == 3 &&
                  pathSection[1] == siteSlug &&
                  pathSection[2] != "collections" &&
                  pathSection[2] != "posts"
               ) {
                  return { customPageSlug: pathSection[2], pageViews, path };
               }
               //Collection lists
               if (pathSection?.length == 4 && pathSection[2] == "c") {
                  return { listSlug: pathSection[3], pageViews, path };
               }
               //Entry pages
               if (pathSection?.length == 5 && pathSection[2] == "c") {
                  return {
                     collectionSlug: pathSection[3],
                     entrySlug: pathSection[4],
                     pageViews,
                     path,
                  };
               }
               //Post singleton
               if (pathSection?.length == 4 && pathSection[2] == "p") {
                  return { postSlug: pathSection[3], pageViews, path };
               }
               return {
                  pageViews,
                  path,
               };
            });

      async function getEntryData(doc: {
         customPageSlug?: string;
         entrySlug?: string;
         postSlug?: string;
         collectionSlug?: string;
         listSlug?: string;
         pageViews: string | null | undefined;
      }) {
         //Determine if need to fetch other graphql db
         const customCollection = collections.find(
            (collection: Collection) =>
               collection.slug == doc.collectionSlug &&
               collection.customDatabase == true,
         );

         //Get custom page data
         if (doc?.customPageSlug) {
            const query = {
               query: {
                  __variables: {
                     customPageSlug: "String!",
                     siteId: "JSON!",
                  },
                  customPageData: {
                     __aliasFor: "CustomPages",
                     __args: {
                        where: {
                           //Query for core site on Entries collection
                           site: {
                              equals: new VariableType("siteId"),
                           },
                           slug: {
                              equals: new VariableType("customPageSlug"),
                           },
                        },
                     },
                     docs: {
                        name: true,
                        icon: {
                           url: true,
                        },
                     },
                  },
               },
            };

            const graphql_query = jsonToGraphQLQuery(query, {
               pretty: true,
            });

            //@ts-ignore
            const {
               customPageData,
            }: { customPageData: PaginatedDocs<CustomPage> } =
               await authGQLFetcher({
                  variables: {
                     customPageSlug: doc.customPageSlug,
                     siteId: siteId,
                  },
                  document: graphql_query,
               });

            return customPageData?.docs[0];
         }

         //Get post data

         if (doc?.postSlug) {
            const query = {
               query: {
                  __variables: {
                     postSlug: "String!",
                     siteId: "JSON!",
                  },
                  postData: {
                     __aliasFor: "Posts",
                     __args: {
                        where: {
                           site: {
                              equals: new VariableType("siteId"),
                           },
                           slug: {
                              equals: new VariableType("postSlug"),
                           },
                        },
                     },
                     docs: {
                        name: true,
                        icon: {
                           url: true,
                        },
                     },
                  },
               },
            };

            const graphql_query = jsonToGraphQLQuery(query, {
               pretty: true,
            });

            //@ts-ignore
            const { postData }: { postData: PaginatedDocs<Post> } =
               await authGQLFetcher({
                  variables: {
                     siteId: siteId,
                     postSlug: doc?.postSlug,
                  },
                  document: graphql_query,
               });

            return postData?.docs[0];
         }

         //Get entry data
         if (doc.entrySlug && doc.collectionSlug) {
            const label = gqlFormat(doc.collectionSlug ?? "", "list");

            const query = {
               query: {
                  __variables: {
                     entrySlug: "String!",
                     ...(!customCollection && {
                        siteId: "JSON",
                        collectionId: "JSON",
                     }),
                  },
                  entryData: {
                     __aliasFor: customCollection ? label : "Entries",
                     __args: {
                        where: {
                           //Query for core site on Entries collection
                           ...(!customCollection && {
                              site: {
                                 equals: new VariableType("siteId"),
                              },
                              collectionEntity: {
                                 equals: new VariableType("collectionId"),
                              },
                           }),
                           OR: [
                              {
                                 slug: {
                                    equals: new VariableType("entrySlug"),
                                 },
                              },
                              {
                                 id: {
                                    equals: new VariableType("entrySlug"),
                                 },
                              },
                           ],
                        },
                     },
                     docs: {
                        name: true,
                        icon: {
                           url: true,
                        },
                     },
                  },
               },
            };

            const graphql_query = jsonToGraphQLQuery(query, {
               pretty: true,
            });

            //@ts-ignore
            const { entryData }: { entryData: PaginatedDocs<Entry> } =
               await authGQLFetcher({
                  siteSlug: customCollection ? siteSlug : undefined,
                  variables: {
                     entrySlug: doc.entrySlug,
                     //Only send siteId and collectionID if core site
                     ...(!customCollection && {
                        collectionId: customCollection?.id,
                        siteId,
                     }),
                  },
                  document: graphql_query,
               });

            return entryData?.docs[0];
         }

         //Get Collection list data
         if (doc.listSlug) {
            const label = gqlFormat(doc.listSlug, "list");

            const query = {
               query: {
                  __variables: {
                     listSlug: "String!",
                  },
                  listData: {
                     __aliasFor: customCollection ? label : "Collections",
                     __args: {
                        where: {
                           ...(!customCollection && {
                              site: {
                                 equals: siteId,
                              },
                           }),
                           OR: [
                              {
                                 slug: {
                                    equals: new VariableType("listSlug"),
                                 },
                              },
                              {
                                 id: {
                                    equals: new VariableType("listSlug"),
                                 },
                              },
                           ],
                        },
                     },
                     docs: {
                        name: true,
                        icon: {
                           url: true,
                        },
                     },
                  },
               },
            };

            const graphql_query = jsonToGraphQLQuery(query, {
               pretty: true,
            });

            //@ts-ignore
            const { listData }: { listData: PaginatedDocs<Entry> } =
               await authGQLFetcher({
                  siteSlug: customCollection ? siteSlug : undefined,
                  variables: {
                     listSlug: doc.listSlug,
                  },
                  document: graphql_query,
               });
            return listData?.docs[0];
         }
      }

      //Fetch icon and name, then clean
      const trendingPages =
         filteredRows &&
         (
            await Promise.all(
               filteredRows.map(async (doc) => {
                  return {
                     pageViews: doc.pageViews,
                     path: doc.path,
                     data: await getEntryData(doc),
                  };
               }),
            )
         ).filter((doc) => {
            if (!doc?.data) {
               return false;
            }
            return true;
         });

      //Get total site posts
      const postTotalQuery = qs.stringify(
         {
            where: {
               site: {
                  equals: siteId,
               },
            },
            depth: 0,
         },
         { addQueryPrefix: true },
      );

      const getPostsTotal = (await authRestFetcher({
         method: "GET",
         path: `${settings.domainFull}/api/posts${postTotalQuery}`,
      })) as PaginatedDocs<Post>;

      //Get total site entries
      const entryTotalQuery = qs.stringify(
         {
            where: {
               site: {
                  equals: siteId,
               },
            },
            depth: 0,
         },
         { addQueryPrefix: true },
      );

      const totalEntries = await (
         await Promise.all(
            collections.map(
               async (collection: {
                  id: string;
                  slug: string;
                  customDatabase: boolean;
               }) => {
                  if (collection.customDatabase == true) {
                     const totalCustomEntries = await authRestFetcher({
                        method: "GET",
                        path: `https://${siteSlug}-db.${settings?.domain}/api/${collection.slug}`,
                     });
                     return totalCustomEntries.totalDocs;
                  }
                  const totalCoreEntries = await authRestFetcher({
                     method: "GET",
                     path: `${settings.domainFull}/api/entries${entryTotalQuery}`,
                  });
                  return totalCoreEntries.totalDocs;
               },
            ),
         )
      ).reduce((partialSum, a) => partialSum + a, 0);

      //Update site with new data
      await authRestFetcher({
         method: "PATCH",
         path: `${settings.domainFull}/api/sites/${siteId}`,
         body: {
            ...(getPostsTotal.totalDocs && {
               totalPosts: getPostsTotal.totalDocs,
            }),
            ...(totalEntries && {
               totalEntries: totalEntries,
            }),
            ...(trendingPages && {
               trendingPages: trendingPages,
            }),
         },
      });

      return {
         trendingPages,
         totalEntries,
         totalPosts: getPostsTotal.totalDocs,
      };
   },
);
