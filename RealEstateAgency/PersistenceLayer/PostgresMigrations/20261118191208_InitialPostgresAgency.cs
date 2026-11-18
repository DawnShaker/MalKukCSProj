using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace RealEstateAgency.PersistenceLayer.PostgresMigrations
{
    /// <inheritdoc />
    public partial class InitialPostgresAgency : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "agency_ef");

            migrationBuilder.CreateTable(
                name: "agency_revision",
                schema: "agency_ef",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false),
                    version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_agency_revision", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "agents",
                schema: "agency_ef",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    name = table.Column<string>(type: "text", nullable: false),
                    experienceYears = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_agents", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "DataProtectionKeys",
                schema: "agency_ef",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    friendlyName = table.Column<string>(type: "text", nullable: true),
                    xml = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DataProtectionKeys", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "clients",
                schema: "agency_ef",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    agentId = table.Column<Guid>(type: "uuid", nullable: true),
                    name = table.Column<string>(type: "text", nullable: false),
                    contactInfo = table.Column<string>(type: "text", nullable: false),
                    type = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_clients", x => x.id);
                    table.ForeignKey(
                        name: "FK_clients_agents_agentId",
                        column: x => x.agentId,
                        principalSchema: "agency_ef",
                        principalTable: "agents",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "properties",
                schema: "agency_ef",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    agentId = table.Column<Guid>(type: "uuid", nullable: true),
                    type = table.Column<string>(type: "text", nullable: false),
                    area = table.Column<double>(type: "double precision", nullable: false),
                    address = table.Column<string>(type: "text", nullable: false),
                    district = table.Column<string>(type: "text", nullable: false),
                    landmark = table.Column<string>(type: "text", nullable: false),
                    rooms = table.Column<int>(type: "integer", nullable: false),
                    yearBuilt = table.Column<int>(type: "integer", nullable: false),
                    price = table.Column<decimal>(type: "numeric", nullable: false),
                    status = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_properties", x => x.id);
                    table.ForeignKey(
                        name: "FK_properties_agents_agentId",
                        column: x => x.agentId,
                        principalSchema: "agency_ef",
                        principalTable: "agents",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "client_notifications",
                schema: "agency_ef",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    clientId = table.Column<Guid>(type: "uuid", nullable: false),
                    message = table.Column<string>(type: "text", nullable: false),
                    createdAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    position = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_client_notifications", x => x.id);
                    table.ForeignKey(
                        name: "FK_client_notifications_clients_clientId",
                        column: x => x.clientId,
                        principalSchema: "agency_ef",
                        principalTable: "clients",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "client_requests",
                schema: "agency_ef",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    clientId = table.Column<Guid>(type: "uuid", nullable: false),
                    title = table.Column<string>(type: "text", nullable: false),
                    filter = table.Column<string>(type: "text", nullable: false),
                    createdAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    isActive = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_client_requests", x => x.id);
                    table.ForeignKey(
                        name: "FK_client_requests_clients_clientId",
                        column: x => x.clientId,
                        principalSchema: "agency_ef",
                        principalTable: "clients",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "saved_searches",
                schema: "agency_ef",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    clientId = table.Column<Guid>(type: "uuid", nullable: false),
                    createdAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    title = table.Column<string>(type: "text", nullable: false),
                    filter = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_saved_searches", x => x.id);
                    table.ForeignKey(
                        name: "FK_saved_searches_clients_clientId",
                        column: x => x.clientId,
                        principalSchema: "agency_ef",
                        principalTable: "clients",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "search_history",
                schema: "agency_ef",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    clientId = table.Column<Guid>(type: "uuid", nullable: false),
                    createdAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    filter = table.Column<string>(type: "text", nullable: false),
                    resultCount = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_search_history", x => x.id);
                    table.ForeignKey(
                        name: "FK_search_history_clients_clientId",
                        column: x => x.clientId,
                        principalSchema: "agency_ef",
                        principalTable: "clients",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "user_profiles",
                schema: "agency_ef",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    email = table.Column<string>(type: "text", nullable: false),
                    displayName = table.Column<string>(type: "text", nullable: false),
                    role = table.Column<string>(type: "text", nullable: false),
                    agentId = table.Column<Guid>(type: "uuid", nullable: true),
                    clientId = table.Column<Guid>(type: "uuid", nullable: true),
                    createdAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_user_profiles", x => x.id);
                    table.ForeignKey(
                        name: "FK_user_profiles_agents_agentId",
                        column: x => x.agentId,
                        principalSchema: "agency_ef",
                        principalTable: "agents",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_user_profiles_clients_clientId",
                        column: x => x.clientId,
                        principalSchema: "agency_ef",
                        principalTable: "clients",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "deals",
                schema: "agency_ef",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    date = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    propertyId = table.Column<Guid>(type: "uuid", nullable: false),
                    agentId = table.Column<Guid>(type: "uuid", nullable: false),
                    clientId = table.Column<Guid>(type: "uuid", nullable: false),
                    totalCost = table.Column<decimal>(type: "numeric", nullable: false),
                    type = table.Column<int>(type: "integer", nullable: false),
                    commissionPercent = table.Column<decimal>(type: "numeric", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_deals", x => x.id);
                    table.ForeignKey(
                        name: "FK_deals_agents_agentId",
                        column: x => x.agentId,
                        principalSchema: "agency_ef",
                        principalTable: "agents",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_deals_clients_clientId",
                        column: x => x.clientId,
                        principalSchema: "agency_ef",
                        principalTable: "clients",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_deals_properties_propertyId",
                        column: x => x.propertyId,
                        principalSchema: "agency_ef",
                        principalTable: "properties",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "property_price_history",
                schema: "agency_ef",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    propertyId = table.Column<Guid>(type: "uuid", nullable: false),
                    position = table.Column<int>(type: "integer", nullable: false),
                    changedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    oldPrice = table.Column<decimal>(type: "numeric", nullable: false),
                    newPrice = table.Column<decimal>(type: "numeric", nullable: false),
                    comment = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_property_price_history", x => x.id);
                    table.ForeignKey(
                        name: "FK_property_price_history_properties_propertyId",
                        column: x => x.propertyId,
                        principalSchema: "agency_ef",
                        principalTable: "properties",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "property_status_history",
                schema: "agency_ef",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    propertyId = table.Column<Guid>(type: "uuid", nullable: false),
                    position = table.Column<int>(type: "integer", nullable: false),
                    changedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    oldStatus = table.Column<int>(type: "integer", nullable: false),
                    newStatus = table.Column<int>(type: "integer", nullable: false),
                    comment = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_property_status_history", x => x.id);
                    table.ForeignKey(
                        name: "FK_property_status_history_properties_propertyId",
                        column: x => x.propertyId,
                        principalSchema: "agency_ef",
                        principalTable: "properties",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.InsertData(
                schema: "agency_ef",
                table: "agency_revision",
                columns: new[] { "id", "version" },
                values: new object[] { 1, 0L });

            migrationBuilder.CreateIndex(
                name: "IX_client_notifications_clientId",
                schema: "agency_ef",
                table: "client_notifications",
                column: "clientId");

            migrationBuilder.CreateIndex(
                name: "IX_client_requests_clientId",
                schema: "agency_ef",
                table: "client_requests",
                column: "clientId");

            migrationBuilder.CreateIndex(
                name: "IX_clients_agentId",
                schema: "agency_ef",
                table: "clients",
                column: "agentId");

            migrationBuilder.CreateIndex(
                name: "IX_deals_agentId",
                schema: "agency_ef",
                table: "deals",
                column: "agentId");

            migrationBuilder.CreateIndex(
                name: "IX_deals_clientId",
                schema: "agency_ef",
                table: "deals",
                column: "clientId");

            migrationBuilder.CreateIndex(
                name: "IX_deals_propertyId",
                schema: "agency_ef",
                table: "deals",
                column: "propertyId");

            migrationBuilder.CreateIndex(
                name: "IX_properties_agentId",
                schema: "agency_ef",
                table: "properties",
                column: "agentId");

            migrationBuilder.CreateIndex(
                name: "IX_property_price_history_propertyId",
                schema: "agency_ef",
                table: "property_price_history",
                column: "propertyId");

            migrationBuilder.CreateIndex(
                name: "IX_property_status_history_propertyId",
                schema: "agency_ef",
                table: "property_status_history",
                column: "propertyId");

            migrationBuilder.CreateIndex(
                name: "IX_saved_searches_clientId",
                schema: "agency_ef",
                table: "saved_searches",
                column: "clientId");

            migrationBuilder.CreateIndex(
                name: "IX_search_history_clientId",
                schema: "agency_ef",
                table: "search_history",
                column: "clientId");

            migrationBuilder.CreateIndex(
                name: "IX_user_profiles_agentId",
                schema: "agency_ef",
                table: "user_profiles",
                column: "agentId");

            migrationBuilder.CreateIndex(
                name: "IX_user_profiles_clientId",
                schema: "agency_ef",
                table: "user_profiles",
                column: "clientId");

            migrationBuilder.CreateIndex(
                name: "IX_user_profiles_email",
                schema: "agency_ef",
                table: "user_profiles",
                column: "email",
                unique: true);

            migrationBuilder.Sql("""
                REVOKE ALL ON SCHEMA agency_ef FROM PUBLIC;
                REVOKE ALL ON ALL TABLES IN SCHEMA agency_ef FROM PUBLIC;
                DO $rls$
                DECLARE row record; principal text;
                BEGIN
                    FOREACH principal IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
                        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = principal) THEN
                            EXECUTE format('REVOKE ALL ON SCHEMA agency_ef FROM %I', principal);
                            EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA agency_ef FROM %I', principal);
                        END IF;
                    END LOOP;
                    FOR row IN SELECT tablename FROM pg_tables WHERE schemaname = 'agency_ef' LOOP
                        EXECUTE format('ALTER TABLE agency_ef.%I ENABLE ROW LEVEL SECURITY', row.tablename);
                    END LOOP;
                END $rls$;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "agency_revision",
                schema: "agency_ef");

            migrationBuilder.DropTable(
                name: "client_notifications",
                schema: "agency_ef");

            migrationBuilder.DropTable(
                name: "client_requests",
                schema: "agency_ef");

            migrationBuilder.DropTable(
                name: "DataProtectionKeys",
                schema: "agency_ef");

            migrationBuilder.DropTable(
                name: "deals",
                schema: "agency_ef");

            migrationBuilder.DropTable(
                name: "property_price_history",
                schema: "agency_ef");

            migrationBuilder.DropTable(
                name: "property_status_history",
                schema: "agency_ef");

            migrationBuilder.DropTable(
                name: "saved_searches",
                schema: "agency_ef");

            migrationBuilder.DropTable(
                name: "search_history",
                schema: "agency_ef");

            migrationBuilder.DropTable(
                name: "user_profiles",
                schema: "agency_ef");

            migrationBuilder.DropTable(
                name: "properties",
                schema: "agency_ef");

            migrationBuilder.DropTable(
                name: "clients",
                schema: "agency_ef");

            migrationBuilder.DropTable(
                name: "agents",
                schema: "agency_ef");
        }
    }
}
